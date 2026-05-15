"""Information required for computing evaluation metrics for a redistricting plan.

`DocumentEvaluationContext` is the data bag passed to every metric.

`CountyContext` is a singleton (`COUNTY_CONTEXT`) holding two per-gerrydb-table caches:
  - county populations ({county_geoid: total_pop}), used by splits and Eguia metrics.
  - population-weighted Dem/Rep county win probabilities, used only by the Eguia metric.
"""

import dataclasses
import logging
from functools import cached_property
from typing import ClassVar, NewType

import fastapi
import numpy as np
import pandas as pd
import sqlalchemy
import sqlmodel
from app.evaluation.models import CountyDemographics
from app.models import DistrictUnionsResponse, DistrictrMap, Document
from app.utils import (
    update_or_select_district_stats,
    assert_safe_ident,
    get_gerrydb_numeric_cols,
)

logger = logging.getLogger(__name__)

GerrydbTableName = NewType("GerrydbTableName", str)
Election = NewType("Election", str)
ElectionPartyKey = NewType("ElectionPartyKey", str)
CountyGeoid = NewType("CountyGeoid", str)
DemographicColumn = NewType("DemographicColumn", str)

TOTAL_POP_COL = "total_pop_20"

@dataclasses.dataclass
class DocumentEvaluationContext:
    """Lazy, per-document inputs for computing all evaluation metrics.

    Some intermediates used by multiple metrics (e.g. `dem_wins`, `dem_seats`) are
    calculated here as `@cached_property` to avoid redundant work across metrics.
    """

    background_tasks: fastapi.BackgroundTasks
    session: sqlmodel.Session
    document_id: str

    @cached_property
    def district_stats(self) -> list[DistrictUnionsResponse]:
        """Per-zone stats for this document."""
        return update_or_select_district_stats(
            self.session, self.document_id, self.background_tasks
        )

    @cached_property
    def demographic_data(self) -> pd.DataFrame:
        """Per-zone demographic data for non-empty districts."""
        rows = [
            {"zone": d.zone, **d.demographic_data}
            for d in self.district_stats
            if d.demographic_data and d.zone is not None
        ]
        return pd.DataFrame(rows).set_index("zone") if rows else pd.DataFrame()

    @cached_property
    def elections(self) -> list[Election]:
        """Election prefixes for demographic columns (e.g. "pres_2020")"""
        return [
            Election(s.removesuffix("_dem"))
            for s in self.demographic_data.columns
            if s.endswith("_dem")
        ]

    @cached_property
    def demographic_columns(self) -> list[DemographicColumn]:
        """Demographic columns (e.g. "hpop_20")"""
        return [
            col
            for col in self.demographic_data.columns
            if "pop" in col and not col.startswith(("other_pop", "total_pop"))
        ]

    @cached_property
    def dem_wins(self) -> dict[Election, pd.Series]:
        """Boolean Series per election of whether Dems won each district."""
        return {
            col: self.demographic_data[col + "_dem"]
            > self.demographic_data[col + "_rep"]
            for col in self.elections
        }

    @cached_property
    def rep_wins(self) -> dict[Election, pd.Series]:
        """Boolean Series per election of whether Reps won each district."""
        return {
            col: self.demographic_data[col + "_rep"]
            > self.demographic_data[col + "_dem"]
            for col in self.elections
        }

    @cached_property
    def dem_seats(self) -> dict[Election, int]:
        """Total Dem seats statewide for each election."""
        return {col: sum(self.dem_wins[col]) for col in self.elections}

    @cached_property
    def rep_seats(self) -> dict[Election, int]:
        """Total Rep seats statewide for each election."""
        return {col: sum(self.rep_wins[col]) for col in self.elections}

    @cached_property
    def num_nonempty_districts(self) -> int:
        """Number of districts with an assigned zone."""
        return sum(1 for d in self.district_stats if d.zone is not None)
    
    @cached_property
    def ideal_population(self) -> int:
        """Ideal population per district."""
        total_pop = sum(
            d.demographic_data[TOTAL_POP_COL]
            for d in self.district_stats
            if (d.demographic_data and TOTAL_POP_COL in d.demographic_data
                and d.demographic_data[TOTAL_POP_COL] is not None)
        )
        return total_pop // self.num_nonempty_districts
    
    @cached_property
    def _districtr_map(self) -> DistrictrMap | None:
        """The DistrictrMap associated with this document."""
        return self.session.exec(
            sqlmodel.select(DistrictrMap)
            .join(Document, Document.districtr_map_slug == DistrictrMap.districtr_map_slug)
            .where(Document.document_id == self.document_id)
        ).one_or_none()

    @cached_property
    def gerrydb_table(self) -> GerrydbTableName | None:
        """The document's gerrydb table name (may be a shatterable UNION ALL view)."""
        m = self._districtr_map
        return GerrydbTableName(m.gerrydb_table_name) if m and m.gerrydb_table_name else None

    @cached_property
    def parent_layer(self) -> GerrydbTableName | None:
        """The parent-layer gerrydb table name, used for county-level aggregation."""
        m = self._districtr_map
        return GerrydbTableName(m.parent_layer) if m else None

    @cached_property
    def child_layer(self) -> GerrydbTableName | None:
        """The child (block-level) gerrydb table name, or `None` for non-shatterable maps."""
        m = self._districtr_map
        return GerrydbTableName(m.child_layer) if m and m.child_layer else None


@dataclasses.dataclass
class CountyContext:
    """A singleton lookup of per-gerrydb-table Eguia ideals, which are compared to the
    plan's seat outcomes to compute the Eguia metric.

    For each gerrydb table name, records a mapping between election+party string (e.g.
    "pres_2020_dem") and this party's seat share that would emerge if districts were
    drawn at county granularity, weighted by population.

    Keyed by gerrydb_table_name rather than state FIPS so that multi-state regions
    (e.g. Navajo Nation) are handled correctly — a single gerrydb table may span
    counties in several states.

    Computed on first request and never recomputed.
    """

    # Stop retrying after this many consecutive empty results to avoid hammering
    # the DB indefinitely for a permanently malformed gerrydb table.
    MAX_LOAD_ATTEMPTS: ClassVar[int] = 3

    _cache: dict[GerrydbTableName, dict[ElectionPartyKey, float]] = dataclasses.field(default_factory=dict)
    _pop_cache: dict[GerrydbTableName, dict[CountyGeoid, int]] = dataclasses.field(default_factory=dict)
    _attempts: dict[GerrydbTableName, int] = dataclasses.field(default_factory=dict)

    def county_populations(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[CountyGeoid, int]:
        """Return a {county_geoid: total_pop} dict for `gerrydb_table`.

        Cached after first load. Returns an empty dict if county data is unavailable
        (e.g. gerrydb table lacks total_pop_20). Retried up to MAX_LOAD_ATTEMPTS times.
        """
        cached = self._pop_cache.get(gerrydb_table)
        if cached is not None:
            return cached
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            return {}
        self._attempts[gerrydb_table] = self._attempts.get(gerrydb_table, 0) + 1
        self._ensure_county_data(gerrydb_table, session)
        rows = session.exec(
            sqlmodel.select(CountyDemographics.geoid, CountyDemographics.total_pop).where(
                CountyDemographics.gerrydb_table_name == gerrydb_table
            )
        ).all()
        pops = {
            CountyGeoid(geoid): int(total_pop)
            for geoid, total_pop in rows
            if geoid and total_pop is not None
        }
        self._pop_cache[gerrydb_table] = pops
        return pops

    def ideals_for_eguia(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[ElectionPartyKey, float]:
        """Return the per-ElectionPartyKey seat share expectation dict for `gerrydb_table`.

        Args:
            gerrydb_table: Source VTD/block table whose county-level aggregates
                back the ideal. Used both as the cache key and to populate
                `evaluation.county_demographics` on first request.
            session: SQLModel session for any required DB queries.

        A cached non-empty result is returned immediately. A cached empty result
        (`{}`) means a prior attempt failed; the call is retried up to
        `MAX_LOAD_ATTEMPTS` times. After that the singleton returns `{}` without
        touching the DB, gracefully handling permanently malformed gerrydb tables.
        """
        cached = self._cache.get(gerrydb_table)
        if cached:
            return cached
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            return {}
        self._attempts[gerrydb_table] = self._attempts.get(gerrydb_table, 0) + 1
        self._ensure_county_data(gerrydb_table, session)
        self._cache[gerrydb_table] = self._compute_ideal(gerrydb_table, session)
        return self._cache[gerrydb_table]

    def _ensure_county_data(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> None:
        """Populate `evaluation.county_demographics` for `gerrydb_table` unless at
        least one row with a non-null total_pop already exists.

        Requiring total_pop IS NOT NULL (rather than mere row existence) guards
        against a previous load that inserted rows without population data (e.g.
        because the gerrydb table lacked total_pop_20). Those rows are present but
        unusable, so we attempt re-population rather than treating them as a
        successful prior load.
        """
        exists = session.exec(
            sqlmodel.select(CountyDemographics)
            .where(CountyDemographics.gerrydb_table_name == gerrydb_table)
            .where(CountyDemographics.total_pop.isnot(None))
            .limit(1)
        ).first()
        if not exists:
            self._populate_county_data(gerrydb_table, session)

    def _populate_county_data(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> None:
        """Aggregate unit-level demographics up to county level.

        Extracts the county GEOID (first 5 characters) from each row's path,
        handling both colon-prefixed paths (e.g. ``vtd:20051XXXX`` → ``20051``)
        and bare block paths (e.g. ``200510726002341`` → ``20051``).
        """
        safe_table = assert_safe_ident(gerrydb_table)

        # Guard: skip if this is not a plain table (relkind='r'). Materialized views
        # created by create_shatterable_gerrydb_view are UNION ALL of parent + child
        # layers; aggregating them up to county level would double-count every row.
        relkind = session.execute(
            sqlalchemy.text(
                "SELECT relkind FROM pg_class "
                "JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid "
                "WHERE relname = :name AND nspname = 'gerrydb'"
            ),
            {"name": gerrydb_table},
        ).scalar_one_or_none()
        if relkind != "r":
            return

        demo_cols = get_gerrydb_numeric_cols(session, safe_table)

        if not demo_cols:
            return
        json_pairs = [f"'{col}', SUM({col})" for col in demo_cols]
        demographic_json = f"json_build_object({', '.join(json_pairs)})"
        total_pop_expr = "SUM(total_pop_20)" if "total_pop_20" in demo_cols else "NULL"

        insert_sql = f"""
            INSERT INTO evaluation.county_demographics (geoid, gerrydb_table_name, total_pop, demographic_data)
            SELECT
                CASE
                    WHEN path LIKE '%:%' THEN LEFT(SPLIT_PART(path, ':', 2), 5)
                    ELSE LEFT(path, 5)
                END AS geoid,
                :gerrydb_table AS gerrydb_table_name,
                {total_pop_expr} AS total_pop,
                {demographic_json} AS demographic_data
            FROM gerrydb.{safe_table}
            GROUP BY geoid
            ON CONFLICT (geoid, gerrydb_table_name) DO NOTHING
        """
        session.execute(sqlalchemy.text(insert_sql), {"gerrydb_table": gerrydb_table})
        session.commit()

    def _compute_ideal(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[ElectionPartyKey, float]:
        """Population-weighted county-level Dem/Rep win frequency per election."""
        rows = session.exec(
            sqlmodel.select(CountyDemographics).where(
                CountyDemographics.gerrydb_table_name == gerrydb_table
            )
        ).all()

        if not rows:
            return {}

        df = pd.DataFrame([r.demographic_data or {} for r in rows])
        county_pops = pd.array([r.total_pop or 0 for r in rows], dtype="int64")
        total_pop = county_pops.sum()
        if total_pop == 0:
            return {}

        dem_cols: list[ElectionPartyKey] = [
            ElectionPartyKey(c) for c in df.columns if c.endswith("_dem")
        ]
        ideals: dict[ElectionPartyKey, float] = {}
        for dem_col in dem_cols:
            base = dem_col.removesuffix("_dem")
            rep_col = ElectionPartyKey(f"{base}_rep")
            if rep_col not in df.columns:
                continue
            results_dem = df[dem_col] > df[rep_col]
            results_rep = df[rep_col] > df[dem_col]
            ideals[dem_col] = float(np.dot(results_dem, county_pops) / total_pop)
            ideals[rep_col] = float(np.dot(results_rep, county_pops) / total_pop)

        return ideals


# Server-owned singleton. Shared across all requests; one entry per gerrydb table.
COUNTY_CONTEXT = CountyContext()


