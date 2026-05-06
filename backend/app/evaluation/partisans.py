from typing import Tuple
import sqlmodel
import numpy as np
from sqlalchemy import text
from app.evaluation.context import DocumentEvaluationContext, STATE_IDEAL_CACHE
from app.utils import assert_safe_ident
from app.models import DistrictrMap, Document


def wasted_votes(party1_votes: int, party2_votes: int) -> Tuple[int, int]:
    """
    Copied from gerrychain library.
    """
    total_votes = party1_votes + party2_votes
    if party1_votes > party2_votes:
        party1_waste = party1_votes - total_votes / 2
        party2_waste = party2_votes
    else:
        party2_waste = party2_votes - total_votes / 2
        party1_waste = party1_votes
    return party1_waste, party2_waste


def efficiency_gap(context: DocumentEvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        wasted_votes_by_district = map(wasted_votes, dem_votes, rep_votes)
        numerator = sum(
            rep_waste - dem_waste for dem_waste, rep_waste in wasted_votes_by_district
        )
        total_votes = sum(dem_votes) + sum(rep_votes)
        result[col] = numerator / total_votes
    return result


def seats(context: DocumentEvaluationContext) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for col in context.election_cols():
        result[col] = {"dem": context.dem_seats(col), "rep": context.rep_seats(col)}
    return result


def mean_median(context: DocumentEvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        dem_vote_shares = dem_votes / (dem_votes + rep_votes)
        result[col] = dem_vote_shares.median() - dem_vote_shares.mean()
    return result


def partisan_bias(context: DocumentEvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        dem_vote_shares = dem_votes / (dem_votes + rep_votes)
        mean_share = dem_vote_shares.mean()
        above_mean_districts = len(dem_vote_shares[dem_vote_shares > mean_share])
        result[col] = above_mean_districts / context.num_districts() - 0.5
    return result


def proportionality(context: DocumentEvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        dem_vote_share = sum(dem_votes) / (sum(dem_votes) + sum(rep_votes))
        result[col] = (context.dem_seats(col) / context.num_districts()) - dem_vote_share
    return result

def _get_state_fips_and_gerrydb_table(context: DocumentEvaluationContext) -> tuple[str | None, str | None]:
    doc_row = context.session.exec(
        sqlmodel.select(
            Document,
            DistrictrMap.gerrydb_table_name.label("gerrydb_table_name"),
            DistrictrMap.statefps.label("statefps"),
        )
        .join(DistrictrMap, Document.districtr_map_slug == DistrictrMap.districtr_map_slug)
        .where(Document.document_id == context.document_id)
    ).one()

    statefps = doc_row.statefps
    gerrydb_table = doc_row.gerrydb_table_name
    if statefps:
        state_fips = statefps[0]
    elif gerrydb_table:
        safe_table = assert_safe_ident(gerrydb_table)
        row = context.session.execute(
            text(f"SELECT LEFT(SPLIT_PART(path, ':', 2), 2) AS state_fips FROM gerrydb.{safe_table} LIMIT 1")
        ).first()
        state_fips = row.state_fips if row else None
    else:
        state_fips = None
        gerrydb_table = None

    return state_fips, gerrydb_table

def eguia(context: DocumentEvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""

    state_fips, gerrydb_table = _get_state_fips_and_gerrydb_table(context)

    ideals: dict[str, float] = (
        STATE_IDEAL_CACHE.get(state_fips, gerrydb_table, context.session)
        if state_fips and gerrydb_table
        else {}
    )

    result: dict[str, float] = {}
    for col in context.election_cols():
        result[col] = (context.dem_seats(col) / context.num_districts()) - ideals.get(col + "_dem", 0.0)
    return result

def competitive_metrics(context: DocumentEvaluationContext) -> dict[str, int]:
    """ A number of competitive metrics.

    - n_dem_districts: Number of districts won by Democrats in each election.

    - n_rep_districts: Number of districts won by Republicans in each election.

    - n_swing_districts: Number of districts that have been won by each major party at
    least once across the elections in the dataset.
    
    - n_competitive_districts: Number of
    districts where neither party wins more than 53% of the vote in any election.

    - n_districts: Total number of districts.

    - n_elections: Total number of elections.
    """
    n_districts = context.num_districts()
    n_elections = len(context.election_cols())
    if n_elections == 0:
        return {}
    dem_districts = [1] * n_districts
    rep_districts = [1] * n_districts
    n_competitive_districts = 0
    for col in context.election_cols():
        dem_districts = np.logical_and(dem_districts, context.dem_wins(col))
        rep_districts = np.logical_and(rep_districts, context.rep_wins(col))
        dem_vote_shares = context.demographic_data()[col + "_dem"] / (
            context.demographic_data()[col + "_dem"] + context.demographic_data()[col + "_rep"]
        )
        competitive_districts = np.logical_and(dem_vote_shares >= 0.47, dem_vote_shares <= 0.53)
        n_competitive_districts += sum(competitive_districts)
    n_dem_districts = sum(dem_districts)
    n_rep_districts = sum(rep_districts)
    n_swing_districts = context.num_districts() - n_dem_districts - n_rep_districts
    return {
        "n_dem_districts": n_dem_districts,
        "n_rep_districts": n_rep_districts,
        "n_swing_districts": n_swing_districts,
        "n_competitive_districts": n_competitive_districts,
        "n_districts": n_districts,
        "n_elections": n_elections,
    }