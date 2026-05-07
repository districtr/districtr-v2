"""Information required for computing evaluation metrics for a redistricting plan.

`DocumentEvaluationContext` is the data bag passed to every metric.

`StateIdealsForEguia` is a singleton (`STATE_IDEALS_FOR_EGUIA`) holding population-weighted
Dem/Rep county win probabilities per state FIPS. It is only used by the Eguia metric.
"""

import dataclasses
from functools import cached_property
from typing import NewType

import fastapi
import numpy as np
import pandas as pd
import sqlmodel
import sqlalchemy

from app.evaluation.models import CountyDemographics
from app.models import DistrictUnionsResponse
from app.utils import (
    update_or_select_district_stats,
    assert_safe_ident,
    get_gerrydb_numeric_cols,
)


StateFIPS = NewType("StateFIPS", str)
GerrydbTableName = NewType("GerrydbTableName", str)
Election = NewType("Election", str)
ElectionPartyKey = NewType("ElectionPartyKey", str)


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
        """Per-zone demographic data."""
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


@dataclasses.dataclass
class StateIdealsForEguia:
    """A singleton lookup of per-state Eguia ideals, which are compared to the plan's
    seat outcomes to compute the Eguia metric. 

    For each state FIPS code, records a mapping between election+party string (e.g.
    "pres_2020_dem") and this party's seat share that would emerge if districts were
    drawn at county granularity, weighted by population.

    Computed on first request and never recomputed.
    """

    _cache: dict[StateFIPS, dict[ElectionPartyKey, float]] = dataclasses.field(default_factory=dict)

    def get(
        self, state_fips: StateFIPS, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[ElectionPartyKey, float]:
        """Return the per-ElectionPartyKey seat share expectation dict for `state_fips`.

        Args:
            state_fips: the state FIPS code to look up.
            gerrydb_table: Source VTD/block table used to populate county
                demographics on first request for this state. Ignored if the state
                already has rows in `evaluation.county_demographics`.
            session: SQLModel session for any required DB queries.
        """
        if state_fips not in self._cache:
            self._ensure_county_data(state_fips, gerrydb_table, session)
            self._cache[state_fips] = self._compute_ideal(state_fips, session)
        return self._cache[state_fips]

    def _ensure_county_data(
        self, state_fips: StateFIPS, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> None:
        """Populate `evaluation.county_demographics` for `state_fips` if no row
        exists yet. No-op on subsequent calls."""
        exists = session.exec(
            sqlmodel.select(CountyDemographics)
            .where(CountyDemographics.state_fips == state_fips)
            .limit(1)
        ).first()
        if not exists:
            self._populate_county_data(state_fips, gerrydb_table, session)

    def _populate_county_data(
        self, state_fips: StateFIPS, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> None:
        """Aggregate VTD/block-level demographics up to county level.

        Groups gerrydb rows by the first 5 characters of their path after the colon
        prefix (e.g. ``vtd:20051XXXX`` → county GEOID ``20051``).

        NOTE: This table must be manually cleared if the source gerrydb table is
        re-ingested with updated data:
            DELETE FROM evaluation.county_demographics WHERE state_fips =
            '<state_fips>';
        """
        safe_table = assert_safe_ident(gerrydb_table)
        demo_cols = get_gerrydb_numeric_cols(session, safe_table)

        if not demo_cols:
            return
        json_pairs = [f"'{col}', SUM({col})" for col in demo_cols]
        demographic_json = f"json_build_object({', '.join(json_pairs)})"
        total_pop_expr = "SUM(total_pop_20)" if "total_pop_20" in demo_cols else "NULL"

        insert_sql = f"""
            INSERT INTO evaluation.county_demographics (geoid, state_fips, total_pop, demographic_data)
            SELECT
                LEFT(SPLIT_PART(path, ':', 2), 5) AS geoid,
                :state_fips AS state_fips,
                {total_pop_expr} AS total_pop,
                {demographic_json} AS demographic_data
            FROM gerrydb.{safe_table}
            WHERE LEFT(SPLIT_PART(path, ':', 2), 2) = :state_fips
            GROUP BY LEFT(SPLIT_PART(path, ':', 2), 5)
            ON CONFLICT (geoid) DO NOTHING
        """
        session.execute(sqlalchemy.text(insert_sql), {"state_fips": state_fips})
        session.commit()

    def _compute_ideal(
        self, state_fips: StateFIPS, session: sqlmodel.Session
    ) -> dict[ElectionPartyKey, float]:
        """Population-weighted county-level Dem/Rep win frequency per election."""
        rows = session.exec(
            sqlmodel.select(CountyDemographics).where(
                CountyDemographics.state_fips == state_fips
            )
        ).all()

        if not rows:
            return {}

        df = pd.DataFrame([r.demographic_data or {} for r in rows])

        if "total_pop_20" not in df.columns:
            return {}

        county_pops = df["total_pop_20"].fillna(0)
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


# Server-owned singleton. Shared across all requests; one entry per state FIPS.
STATE_IDEALS_FOR_EGUIA = StateIdealsForEguia()
