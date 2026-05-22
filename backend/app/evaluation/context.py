"""Information required for computing evaluation metrics for a redistricting plan.

`DocumentEvaluationContext` is the data bag passed to every metric.

`CountyContext` is a singleton (`COUNTY_CONTEXT`) holding two per-gerrydb-table caches:
  - county populations ({county_geoid: total_pop}), used by splits and Eguia metrics.
  - population-weighted Dem/Rep county win probabilities, used only by the Eguia metric.
"""

import dataclasses
import logging
from functools import cached_property
from typing import Callable, ClassVar, NewType

from app.evaluation.graph import get_graph
import fastapi
import numpy as np
import pandas as pd
import pyproj
import shapely
import sqlalchemy
import sqlmodel
from app.evaluation.models import CountyDemographics
from app.models import Assignments, DistrictUnionsResponse, DistrictrMap, Document
from app.utils import (
    update_or_select_district_stats,
    assert_safe_ident,
    get_gerrydb_numeric_cols,
    Geoid,
    GeoUnitTypeName,
    GEOID_PREDICATES,
)

logger = logging.getLogger(__name__)

GerrydbTableName = NewType("GerrydbTableName", str)
Election = NewType("Election", str)
ElectionPartyKey = NewType("ElectionPartyKey", str)
CountyGeoid = NewType("CountyGeoid", str)
DemographicColumn = NewType("DemographicColumn", str)

TOTAL_POP_COL = "total_pop_20"

_transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)


def _reproject(coords: np.ndarray) -> np.ndarray:
    x, y = _transformer.transform(coords[:, 0], coords[:, 1])
    return np.stack([x, y], axis=1)


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
    def projected_district_geometries(self) -> dict[int, shapely.Geometry]:
        """Well-formed per-zone geometries projected to EPSG:5070, shared by compactness
        metrics."""
        districts = [d for d in self.district_stats if d.zone is not None and d.geometry]
        shapes = np.array([shapely.from_geojson(d.geometry) for d in districts], dtype=object)
        projected = shapely.transform(shapes, _reproject)
        return {d.zone: geom for d, geom in zip(districts, projected) if not geom.is_empty}

    @cached_property
    def demographic_data(self) -> pd.DataFrame:
        """Per-zone demographic data for non-empty districts."""
        rows = [
            {"zone": d.zone, **d.demographic_data}
            for d in self.district_stats
            if d.demographic_data and d.zone is not None
        ]
        if not rows or TOTAL_POP_COL not in rows[0]:
            raise ValueError("No demographic data available for this document.")
        return pd.DataFrame(rows).set_index("zone")

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
    def _districtr_map(self) -> DistrictrMap:
        """The DistrictrMap associated with this document."""
        m = self.session.exec(
            sqlmodel.select(DistrictrMap)
            .join(Document, Document.districtr_map_slug == DistrictrMap.districtr_map_slug)
            .where(Document.document_id == self.document_id)
        ).one_or_none()
        if m is None:
            raise ValueError(f"No DistrictrMap found for document '{self.document_id}'.")
        return m

    @cached_property
    def gerrydb_table(self) -> GerrydbTableName:
        """The document's gerrydb table name (may be a shatterable UNION ALL view)."""
        m = self._districtr_map
        if not m.gerrydb_table_name:
            raise ValueError(f"Document '{self.document_id}' has no gerrydb table name.")
        return GerrydbTableName(m.gerrydb_table_name)

    @cached_property
    def parent_layer(self) -> GerrydbTableName:
        """The parent-layer gerrydb table name, used for county-level aggregation."""
        m = self._districtr_map
        if not m.parent_layer:
            raise ValueError(f"Document '{self.document_id}' has no parent layer.")
        return GerrydbTableName(m.parent_layer)

    @cached_property
    def child_layer(self) -> GerrydbTableName | None:
        """The child (block-level) gerrydb table name, or `None` for non-shatterable maps."""
        m = self._districtr_map
        return GerrydbTableName(m.child_layer) if m.child_layer else None

    @cached_property
    def is_shatterable(self) -> bool:
        """Whether this map has a child (block) layer."""
        return self.child_layer is not None

    @cached_property
    def parent_geo_unit_type(self) -> GeoUnitTypeName:
        """Parent unit type (e.g. 'vtd', 'block'). Raises ValueError if unset in districtrmap"""
        if not self._districtr_map.parent_geo_unit_type:
            raise ValueError(f"Unknown parent_geo_unit_type '{self.parent_geo_unit_type}' for document '{self.document_id}'.")
        return self._districtr_map.parent_geo_unit_type

    @cached_property
    def zone_assignments(self) -> list[tuple[Geoid, int]]:
        """Assignment rows for this document."""
        rows = self.session.exec(
            sqlmodel.select(Assignments.geo_id, Assignments.zone)
            .where(Assignments.document_id == self.document_id)
            .where(Assignments.zone.isnot(None))
        ).all()
        return rows

    @cached_property
    def split_zone_assignments(self) -> tuple[dict[Geoid, int], dict[Geoid, int]]:
        """Assignment rows split into (unit_to_zone, parent_unit_to_zone).

        unit_to_zone        — individually-assigned child units (bare block IDs)
        parent_unit_to_zone — whole-parent assignments (colon-prefixed geo_ids),
                              or all units for non-shatterable maps.
        """
        unit_to_zone: dict[Geoid, int] = {}
        parent_unit_to_zone: dict[Geoid, int] = {}
        if self.is_shatterable:
            is_parent = _GEOID_PREDICATES[self.parent_geo_unit_type]
            for geo_id, zone in self.zone_assignments:
                (parent_unit_to_zone if is_parent(geo_id) else unit_to_zone)[geo_id] = zone
        else:
            for geo_id, zone in self.zone_assignments:
                parent_unit_to_zone[geo_id] = zone
        return unit_to_zone, parent_unit_to_zone


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

        Cached after first load. Raises ValueError if county data is unavailable.
        Retried up to MAX_LOAD_ATTEMPTS times before raising.
        """
        if gerrydb_table in self._pop_cache:
            return self._pop_cache[gerrydb_table]
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            raise ValueError(
                f"County data for '{gerrydb_table}' failed to load after "
                f"{self.MAX_LOAD_ATTEMPTS} attempts."
            )
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

        Raises ValueError if county data is unavailable or malformed. Retried up to
        `MAX_LOAD_ATTEMPTS` times before raising to avoid hammering the DB.
        """
        if gerrydb_table in self._cache:
            return self._cache[gerrydb_table]
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            raise ValueError(
                f"County data for '{gerrydb_table}' failed to load after "
                f"{self.MAX_LOAD_ATTEMPTS} attempts."
            )
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

        # Must be a plain table (relkind='r'). Materialized views created by
        # create_shatterable_gerrydb_view are UNION ALL of parent + child layers;
        # aggregating them up to county level would double-count every row.
        # Callers must pass the plain parent layer, not the combined view.
        relkind = session.execute(
            sqlalchemy.text(
                "SELECT relkind FROM pg_class "
                "JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid "
                "WHERE relname = :name AND nspname = 'gerrydb'"
            ),
            {"name": gerrydb_table},
        ).scalar_one_or_none()
        if relkind != "r":
            raise ValueError(
                f"_populate_county_data requires a plain table (relkind='r'), "
                f"got relkind={relkind!r} for '{gerrydb_table}'. "
                f"Pass the parent layer table, not the combined shatterable view."
            )

        demo_cols = get_gerrydb_numeric_cols(session, safe_table)

        if not demo_cols:
            raise ValueError(
                f"No numeric columns found in gerrydb table '{gerrydb_table}'. "
                f"The table may not have been ingested with demographic data."
            )
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
            raise ValueError(
                f"No county demographics found for '{gerrydb_table}'. "
                f"County data may not have been ingested for this table."
            )

        df = pd.DataFrame([r.demographic_data or {} for r in rows])
        county_pops = pd.array([r.total_pop or 0 for r in rows], dtype="int64")
        total_pop = county_pops.sum()
        if total_pop == 0:
            raise ValueError(
                f"Total county population is zero for '{gerrydb_table}'. "
                f"County demographics may be missing total_pop_20."
            )

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


