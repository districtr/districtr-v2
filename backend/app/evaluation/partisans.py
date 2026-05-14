"""Partisan evaluation metrics.

Each public function takes a `DocumentEvaluationContext` and returns per-election or
plan-wide scores. All signed metrics are reported from the **Democratic** party's point
of view: positive values indicate a Dem advantage, negative values a Rep advantage.
"""

from typing import Tuple, TypedDict
import numpy as np
from app.evaluation.context import (
    DocumentEvaluationContext,
    Election,
    ElectionPartyKey,
    IDEALS_FOR_EGUIA,
)


def _wasted_votes(party1_votes: int, party2_votes: int) -> Tuple[int, int]:
    """Per-district wasted votes for two parties.

    A vote is "wasted" if it was cast for the losing party, or for the winning party in
    excess of the bare majority needed to win.
    """
    total_votes = party1_votes + party2_votes
    if party1_votes > party2_votes:
        party1_waste = party1_votes - total_votes / 2
        party2_waste = party2_votes
    else:
        party2_waste = party2_votes - total_votes / 2
        party1_waste = party1_votes
    return party1_waste, party2_waste


def efficiency_gap(context: DocumentEvaluationContext) -> dict[Election, float]:
    """Per-election efficiency gap (Dem POV).

    Formula:
        EG = (W_R - W_D) / V

    where V is total two-party votes statewide and W_X is the sum of party X's wasted
    votes across districts. A vote is "wasted" if cast for the losing party in a
    district, or for the winning party in excess of a bare majority (see
    `_wasted_votes`). Positive => structural Dem advantage.

    Reference:
        Stephanopoulos & McGhee (2015), "Partisan Gerrymandering and the Efficiency
            Gap," University of Chicago Law Review 82:831. Url:
            https://chicagounbound.uchicago.edu/cgi/viewcontent.cgi?article=1946&context=public_law_and_legal_theory
            JSTOR: https://www.jstor.org/stable/43410706.
    """
    result: dict[Election, float] = {}
    for col in context.elections:
        dem_votes = context.demographic_data[col + "_dem"]
        rep_votes = context.demographic_data[col + "_rep"]
        wasted_votes_by_district = map(_wasted_votes, dem_votes, rep_votes)
        numerator = sum(
            rep_waste - dem_waste for dem_waste, rep_waste in wasted_votes_by_district
        )
        total_votes = sum(dem_votes) + sum(rep_votes)
        result[col] = numerator / total_votes if total_votes > 0 else float("nan")
    return result


def seats(context: DocumentEvaluationContext) -> dict[Election, dict[str, int]]:
    """Per-election seat counts: `{election: {"dem": n, "rep": n}}`.

    Formula:
        S_dem(e) = |{ d : dem_votes(d, e) > rep_votes(d, e) }|
        S_rep(e) = |{ d : rep_votes(d, e) > dem_votes(d, e) }|
        where d ranges over districts and e over elections.
        
    Plurality-winner counts; ties contribute to neither party.
    """
    result: dict[Election, dict[str, int]] = {}
    for col in context.elections:
        result[col] = {"dem": context.dem_seats[col], "rep": context.rep_seats[col]}
    return result


def mean_median(context: DocumentEvaluationContext) -> dict[Election, float]:
    """Per-election median minus mean of Dem two-party vote share (Dem POV).

    Formula:
        MM = median(v_i) - mean(v_i)

    where v_i is district i's Dem two-party vote share. Negative under this sign
    convention => Dem vote share is right-skewed (a few heavily Dem districts inflate
    the mean above the median)

    References:
        McDonald & Best (2015), "Unfair Partisan Gerrymanders in Politics and Law: A
        Diagnostic Applied to Six Cases," Election Law Journal 14:312. Url:
        https://www.brennancenter.org/sites/default/files/legal-work/McDonald_Best_Unfair_Gerrymanders_2015.pdf.
        Doi: https://doi.org/10.1089/elj.2015.0358
    """
    result: dict[Election, float] = {}
    for col in context.elections:
        dem_votes = context.demographic_data[col + "_dem"]
        rep_votes = context.demographic_data[col + "_rep"]
        dem_vote_shares = dem_votes / (dem_votes + rep_votes)
        result[col] = dem_vote_shares.median() - dem_vote_shares.mean()
    return result


def partisan_bias(context: DocumentEvaluationContext) -> dict[Election, float]:
    """Per-election partisan bias (Dem POV).

    Formula (GerryChain "above the mean" partisan bias):
        PB = |{ i : v_i > mean(v) }| / N - 0.5

    where v_i is district i's Democratic two-party vote share and N is the number of
    non-empty districts.

    This is the closed-form expression for partisan bias at 50% under a
    uniform-partisan-swing seats-votes curve parameterized by the unweighted average
    district vote share. If the average district Democratic vote share is mean(v), then
    the uniform swing needed to evaluate the seats-votes curve at 50% is

        s = 0.5 - mean(v).

    After applying this swing, Democrats win district i iff

        v_i + s > 0.5,

    which is equivalent to

        v_i > mean(v).

    Thus the Democratic seat share at 50% average district vote is the fraction of
    districts with v_i > mean(v), and partisan bias is that fraction minus 0.5.

    This matches the average-district-vote partisan-symmetry formulation used in the
    King/Gelman-King/Katz-King-Rosenblatt tradition. See

    References: King, G., & Browning, R. X. (1987). Democratic representation and
        partisan bias in congressional elections. American Political Science Review,
        81(4), 1251-1273. Url: https://gking.harvard.edu/files/sv.pdf (conceptual
        foundation). Doi: https://doi.org/10.2307/1962588
    Katz, J. N., King, G., & Rosenblatt, E. (2020). Theoretical foundations and
        empirical evaluations of partisan fairness in district-based democracies.
        American Political Science Review, 114(1), 164-178. Url:
        https://jkatz.caltech.edu/documents/28620/psym.pdf (contains formula). Doi:
        https://doi.org/10.1017/S000305541900056X
    """
    result: dict[Election, float] = {}
    for col in context.elections:
        dem_votes = context.demographic_data[col + "_dem"]
        rep_votes = context.demographic_data[col + "_rep"]
        dem_vote_shares = dem_votes / (dem_votes + rep_votes)
        mean_share = dem_vote_shares.mean()
        above_mean_districts = len(dem_vote_shares[dem_vote_shares > mean_share])
        result[col] = above_mean_districts / context.num_nonempty_districts - 0.5
    return result


def disproportionality(context: DocumentEvaluationContext) -> dict[Election, float]:
    """Per-election Dem seat share minus Dem vote share (Dem POV).

    Formula:
        D = (S_dem / N) - (V_dem / V_total)

    A signed, single-party variant of disproportionality. Zero is exact proportionality;
    positive => Dems advantage.

    TODO: Add in a link to leaky coalitions paper once it is published.
    
    Reference:
    Katz, J. N., King, G., & Rosenblatt, E. (2020). Theoretical foundations
        and empirical evaluations of partisan fairness in district-based democracies.
        American Political Science Review, 114(1), 164-178.  Url:
        https://jkatz.caltech.edu/documents/28620/psym.pdf. Doi:
        https://doi.org/10.1017/S000305541900056X
    """
    result: dict[Election, float] = {}
    for col in context.elections:
        dem_votes = context.demographic_data[col + "_dem"]
        rep_votes = context.demographic_data[col + "_rep"]
        total = sum(dem_votes) + sum(rep_votes)
        if total == 0:
            result[col] = float("nan")
        else:
            dem_vote_share = sum(dem_votes) / total
            result[col] = (context.dem_seats[col] / context.num_nonempty_districts) - dem_vote_share
    return result

def eguia_county(context: DocumentEvaluationContext) -> dict[Election, float]:
    """Per-election Eguia score (Dem POV).

    Formula:
        E = (S_dem / N) - sum_c (p_c * 1{Dem won county c}) / sum_c p_c

    where the second term sums over counties c in the gerrydb table, p_c is county
    population, and 1{·} is an indicator. The benchmark is the Dem seat share that would
    emerge if districts were drawn at county granularity, weighted by population — a
    "natural ideal" that respects existing political geography.

    Reference:
        Eguia, Jon X. (2022). "A Measure of Partisan Advantage in Redistricting."
        Election Law Journal, 21(1): 84–103. Doi: https://doi.org/10.1089/elj.2020.0691
    """

    # Keyed by parent_layer rather than gerrydb_table_name, since the latter may integrate
    # both the parent layer and the child layer (e.g. block-level vs. vtd-level), which
    # which, when aggregated, will result in double the population counts.
    parent_layer = context.parent_layer
    if not parent_layer:
        return {}

    ideals = IDEALS_FOR_EGUIA.get(parent_layer, context.session)
    if not ideals:
        return {}

    result: dict[Election, float] = {}
    for col in context.elections:
        result[col] = (context.dem_seats[col] / context.num_nonempty_districts) - ideals.get(ElectionPartyKey(col + "_dem"), 0.0)
    return result

class CompetitiveMetrics(TypedDict):
    """Shape of the `competitive_metrics` payload."""
    n_dem_districts: int
    n_rep_districts: int
    n_swing_districts: int
    n_competitive_districts: int
    n_districts: int
    n_elections: int


def competitive_metrics(context: DocumentEvaluationContext) -> CompetitiveMetrics:
    """Plan-wide partisan competitiveness metrics across all elections.

    Formulas (over the set D of districts and E of elections):
        n_dem_districts        = |{ d in D : Dem won d in every e in E }|
        n_rep_districts        = |{ d in D : Rep won d in every e in E }|
        n_swing_districts      = |D| - n_dem_districts - n_rep_districts
        n_competitive_districts = sum over (d, e) in D x E of
                                  1{ 0.47 <= v_{d,e} <= 0.53 }
        n_districts            = |D|
        n_elections            = |E|

    where v_{d,e} is the Dem two-party vote share in district d under election e. The
    47-53% band is a practitioner threshold (a vote is "competitive" if neither party
    clears 53%); academic work uses a range of bands (typically 5-10 points) and the
    choice is a convention rather than a derived constant.
    """

    n_districts = context.num_nonempty_districts
    n_elections = len(context.elections)
    if n_elections == 0:
        return {}
    dem_districts = [1] * n_districts
    rep_districts = [1] * n_districts
    n_competitive_districts = 0
    for col in context.elections:
        dem_districts = np.logical_and(dem_districts, context.dem_wins[col])
        rep_districts = np.logical_and(rep_districts, context.rep_wins[col])
        dem_vote_shares = context.demographic_data[col + "_dem"] / (
            context.demographic_data[col + "_dem"] + context.demographic_data[col + "_rep"]
        )
        competitive_districts = np.logical_and(dem_vote_shares >= 0.47, dem_vote_shares <= 0.53)
        n_competitive_districts += sum(competitive_districts)
    n_dem_districts = sum(dem_districts)
    n_rep_districts = sum(rep_districts)
    n_swing_districts = context.num_nonempty_districts - n_dem_districts - n_rep_districts
    return {
        "n_dem_districts": n_dem_districts,
        "n_rep_districts": n_rep_districts,
        "n_swing_districts": n_swing_districts,
        "n_competitive_districts": n_competitive_districts,
        "n_districts": n_districts,
        "n_elections": n_elections,
    }
