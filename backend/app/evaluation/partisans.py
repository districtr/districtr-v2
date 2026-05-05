from typing import Tuple
from app.evaluation.context import EvaluationContext


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


def efficiency_gap(context: EvaluationContext) -> dict[str, float]:
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


def seats(context: EvaluationContext) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for col in context.election_cols():
        result[col] = {"dem": context.dem_seats(col), "rep": context.rep_seats(col)}
    return result


def mean_median(context: EvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        dem_vote_shares = dem_votes / (dem_votes + rep_votes)
        result[col] = dem_vote_shares.mean() - dem_vote_shares.median()
    return result


def partisan_bias(context: EvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        dem_vote_shares = dem_votes / (dem_votes + rep_votes)
        mean_share = dem_vote_shares.mean()
        above_mean_districts = len(dem_vote_shares[dem_vote_shares > mean_share])
        result[col] = above_mean_districts / len(dem_vote_shares) - 0.5
    return result


def proportionality(context: EvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        dem_votes = context.demographic_data()[col + "_dem"]
        rep_votes = context.demographic_data()[col + "_rep"]
        dem_vote_share = sum(dem_votes) / (sum(dem_votes) + sum(rep_votes))
        result[col] = (context.dem_seats(col) / context.num_districts()) - dem_vote_share
    return result

def eguia(context: EvaluationContext) -> dict[str, float]:
    """Calculated from the point of view of the Democratic party."""
    result: dict[str, float] = {}
    for col in context.election_cols():
        result[col] = (context.dem_seats(col) / context.num_districts()) - context.state_ideal(col + "_dem")
    return result