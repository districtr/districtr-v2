import logging
from typing import Any
import dataclasses

import fastapi
import numpy as np
import pandas as pd
import sqlmodel

from sqlalchemy import text
from app.evaluation.models import CountyDemographics
from app.models import DistrictUnionsResponse
from app.utils import (
    update_or_select_district_stats,
    assert_safe_ident,
    get_gerrydb_numeric_cols,
)


@dataclasses.dataclass
class DocumentEvaluationContext:
    background_tasks: fastapi.BackgroundTasks
    session: sqlmodel.Session
    document_id: str
    _cache: dict[str, Any] = dataclasses.field(default_factory=dict)

    def district_stats(self) -> list[DistrictUnionsResponse]:
        if "district_stats" not in self._cache:
            self._cache["district_stats"] = update_or_select_district_stats(
                self.session, self.document_id, self.background_tasks
            )
        return self._cache["district_stats"]

    def demographic_data(self) -> pd.DataFrame:
        """Excludes districts with null demographic_data or zone, which represent
        unassigned area"""
        if "demographic_data" not in self._cache:
            rows = [
                {"zone": d.zone, **d.demographic_data}
                for d in self.district_stats()
                if d.demographic_data and d.zone is not None
            ]
            self._cache["demographic_data"] = (
                pd.DataFrame(rows).set_index("zone") if rows else pd.DataFrame()
            )
        return self._cache["demographic_data"]

    def election_cols(self) -> list[str]:
        if "election_cols" not in self._cache:
            self._cache["election_cols"] = [
                s.removesuffix("_dem")
                for s in self.demographic_data().columns
                if s.endswith("_dem")
            ]
        return self._cache["election_cols"]
    
    def dem_wins(self, col: str) -> pd.Series:
        """Boolean Series of whether Dems won each district for the given election."""
        key = f"{col}_dem_wins"
        if key not in self._cache:
            dem_votes = self.demographic_data()[col + "_dem"]
            rep_votes = self.demographic_data()[col + "_rep"]
            self._cache[key] = dem_votes > rep_votes
        return self._cache[key]
    
    def rep_wins(self, col: str) -> pd.Series:
        """Boolean Series of whether Reps won each district for the given election."""
        key = f"{col}_rep_wins"
        if key not in self._cache:
            dem_votes = self.demographic_data()[col + "_dem"]
            rep_votes = self.demographic_data()[col + "_rep"]
            self._cache[key] = rep_votes > dem_votes
        return self._cache[key]
    
    def dem_seats(self, col: str) -> int:
        """Total Dem seats statewide for each election."""
        if "dem_seats" not in self._cache:
            self._cache["dem_seats"] = {
                col: sum(self.dem_wins(col))
                for col in self.election_cols()
            }
        return self._cache["dem_seats"].get(col, 0)
    
    def rep_seats(self, col: str) -> int:
        """Total Rep seats statewide for each election."""
        if "rep_seats" not in self._cache:
            self._cache["rep_seats"] = {
                col: sum(self.rep_wins(col))
                for col in self.election_cols()
            }
        return self._cache["rep_seats"].get(col, 0)
    
    def num_districts(self) -> int:
        if "num_districts" not in self._cache:
            self._cache["num_districts"] = sum(1 for d in self.district_stats() if d.zone is not None)
        return self._cache["num_districts"]


@dataclasses.dataclass
class StateIdealCache:
    """Server-owned singleton cache of per-state Eguia ideals.

    One entry per state FIPS code.  Values are never evicted; restart the server
    or clear the evaluation.county_demographics table to force a recompute.
    """

    _cache: dict[str, dict[str, float]] = dataclasses.field(default_factory=dict)

    def get(
        self, state_fips: str, gerrydb_table: str, session: sqlmodel.Session
    ) -> dict[str, float]:
        if state_fips not in self._cache:
            self._ensure_county_data(state_fips, gerrydb_table, session)
            self._cache[state_fips] = self._compute_ideal(state_fips, session)
        return self._cache[state_fips]

    def _ensure_county_data(
        self, state_fips: str, gerrydb_table: str, session: sqlmodel.Session
    ) -> None:
        exists = session.exec(
            sqlmodel.select(CountyDemographics)
            .where(CountyDemographics.state_fips == state_fips)
            .limit(1)
        ).first()
        if not exists:
            self._populate_county_data(state_fips, gerrydb_table, session)

    def _populate_county_data(
        self, state_fips: str, gerrydb_table: str, session: sqlmodel.Session
    ) -> None:
        """Aggregate VTD/block-level demographics up to county level.

        Groups gerrydb rows by the first 5 characters of their path after the
        colon prefix (e.g. ``vtd:20051XXXX`` → county GEOID ``20051``).

        NOTE: This table must be manually cleared if the source gerrydb table is
        re-ingested with updated data:
            DELETE FROM evaluation.county_demographics WHERE state_fips = '<state_fips>';
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
        session.execute(text(insert_sql), {"state_fips": state_fips})
        session.commit()

    def _compute_ideal(
        self, state_fips: str, session: sqlmodel.Session
    ) -> dict[str, float]:
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

        dem_cols = [c for c in df.columns if c.endswith("_dem")]
        ideals: dict[str, float] = {}
        for dem_col in dem_cols:
            base = dem_col.removesuffix("_dem")
            rep_col = f"{base}_rep"
            if rep_col not in df.columns:
                continue
            results_dem = df[dem_col] > df[rep_col]
            results_rep = df[rep_col] > df[dem_col]
            ideals[dem_col] = float(np.dot(results_dem, county_pops) / total_pop)
            ideals[rep_col] = float(np.dot(results_rep, county_pops) / total_pop)

        return ideals


# Server-owned singleton. Shared across all requests; one entry per state FIPS.
STATE_IDEAL_CACHE = StateIdealCache()
