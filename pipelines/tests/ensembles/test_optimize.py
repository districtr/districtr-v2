import numpy as np
import pytest

from ensembles import optimize

ELECTIONS = ["e1", "e2"]


def _partisan_arrays(dem_shares: dict[str, list[list[float]]]) -> dict:
    """Seats and district vote shares from Democratic two-party shares
    (plans x districts) per election."""
    arrays = {}
    for e, shares in dem_shares.items():
        shares = np.array(shares, dtype=float)
        arrays[f"district_vote_shares__{e}"] = shares
        arrays[f"seats__{e}"] = (shares > 0.5).sum(axis=1)
        arrays[f"rep_seats__{e}"] = (shares < 0.5).sum(axis=1)
    return arrays


def test_partisan_composite_adds_the_mean_closest_losing_share_to_summed_seats():
    # e1: Democrats win one district, closest loss 0.45; e2: two, closest 0.48.
    arrays = _partisan_arrays({"e1": [[0.6, 0.45, 0.3]], "e2": [[0.7, 0.55, 0.48]]})

    dem = optimize.partisan_composite(arrays, ELECTIONS, "dem")
    rep = optimize.partisan_composite(arrays, ELECTIONS, "rep")

    np.testing.assert_allclose(dem, [3 + (0.45 + 0.48) / 2])
    # Republican shares e1: 0.4, 0.55, 0.7 (two wins, closest loss 0.4);
    # e2: 0.3, 0.45, 0.52 (one win, closest loss 0.45).
    np.testing.assert_allclose(rep, [3 + (0.4 + 0.45) / 2])


def test_partisan_composite_counts_a_sweep_as_a_closest_loss_of_one_half():
    arrays = _partisan_arrays({"e1": [[0.6, 0.55, 0.51]], "e2": [[0.6, 0.45, 0.3]]})

    dem = optimize.partisan_composite(arrays, ELECTIONS, "dem")

    np.testing.assert_allclose(dem, [3 + 1 + (0.5 + 0.45) / 2])


def test_partisan_tie_breaker_never_outweighs_a_seat():
    # Plan 0 loses its closest districts narrowly; plan 1 wins one more seat
    # and loses the rest by far.
    arrays = _partisan_arrays(
        {
            "e1": [[0.6, 0.4999, 0.4999], [0.6, 0.51, 0.1]],
            "e2": [[0.6, 0.4999, 0.4999], [0.6, 0.51, 0.1]],
        }
    )

    dem = optimize.partisan_composite(arrays, ELECTIONS, "dem")

    assert dem[1] > dem[0]
    assert np.all(dem - np.floor(dem) <= 0.5)


def test_partisan_tie_breaker_ranks_equal_seats_by_the_closest_loss():
    arrays = _partisan_arrays(
        {"e1": [[0.6, 0.40, 0.3], [0.6, 0.47, 0.3]], "e2": [[0.6, 0.4, 0.3]] * 2}
    )

    dem = optimize.partisan_composite(arrays, ELECTIONS, "dem")

    assert dem[1] > dem[0]
    assert np.floor(dem[0]) == np.floor(dem[1])


def test_competitive_contests_count_the_open_three_point_band():
    # Inside: 0.5299, 0.4701, 0.5. On the edge or outside: 0.53, 0.47, 0.6.
    # NaN (a district with no votes) is not a contest.
    arrays = {
        "district_vote_shares__e1": np.array([[0.53, 0.5299, 0.47, np.nan]]),
        "district_vote_shares__e2": np.array([[0.4701, 0.5, 0.6, 0.2]]),
    }

    assert optimize.competitive_contests(arrays, ELECTIONS).tolist() == [3]


def test_objectives_orient_minimized_values_so_larger_is_better():
    splits = optimize.OBJECTIVES["county_splits"]
    seats = optimize.OBJECTIVES["dem_seats"]

    assert splits.oriented(np.array([3, 1])).tolist() == [-3, -1]
    assert seats.oriented(np.array([3, 1])).tolist() == [3, 1]
    assert set(optimize.OBJECTIVES) == {
        "dem_seats",
        "rep_seats",
        "competitive",
        "county_splits",
        "cut_edges",
        "polsby_popper",
    }
    assert {o.direction for o in optimize.OBJECTIVES.values()} == {"max", "min"}


def test_unit_difference_ignores_district_labels():
    a = np.array([0, 0, 1, 1, 2, 2, 2, 2, 2, 2])
    relabelled = np.array([2, 2, 0, 0, 1, 1, 1, 1, 1, 1])
    one_moved = relabelled.copy()
    one_moved[4] = 0

    assert optimize.unit_difference(a, relabelled, 3) == 0.0
    assert optimize.unit_difference(a, one_moved, 3) == pytest.approx(0.1)


def test_distinct_best_skips_plans_too_close_to_a_kept_one():
    base = np.array([0] * 10 + [1] * 10, dtype=np.uint8)
    near = base.copy()
    near[9] = 1  # 5% of units differ from base
    far = base.copy()
    far[7:10] = 1  # 15% differ from base, 10% from near
    assignments = np.array([near, base, far])
    oriented = np.array([2.0, 3.0, 1.0])

    assert optimize.distinct_best(assignments, oriented, 2) == [1, 2]
    assert optimize.distinct_best(assignments, oriented, 2, n=1) == [1]


def test_lineage_follows_parents_back_to_the_seed():
    # Rows 0 and 4 are seeds of two restarts.
    parent = np.array([-1, 0, 1, 1, -1, 4])

    assert optimize.lineage(parent, 3) == [0, 1, 3]
    assert optimize.lineage(parent, 5) == [4, 5]
    assert optimize.lineage(parent, 0) == [0]


class _ScriptedRunner:
    """Returns plans numbered by visit order and records each burst's seed."""

    def __init__(self):
        self.seeds = []
        self.counter = 0

    def run(self, seed, n_steps, rng_seed):
        self.seeds.append(int(seed[0]))
        plans = []
        for _ in range(n_steps):
            self.counter += 1
            plans.append(np.full(4, self.counter, dtype=np.uint8))
        return np.array(plans)


class _ScriptedScorer:
    """County splits looked up by plan number."""

    elections: list[str] = []

    def __init__(self, splits):
        self.splits = splits

    def score(self, assignments):
        return {"county_splits": np.array([self.splits[a[0]] for a in assignments])}


def test_run_restart_climbs_moves_on_ties_and_stops_on_a_plateau():
    # Plan 0 is the seed. Burst 1 visits plans 1-3 (best: plan 2), burst 2
    # plans 4-6 (plan 5 ties the best), burst 3 plans 7-9 (no gain): two bursts
    # without strict improvement end the run with plateau 2.
    splits = [10, 9, 8, 9, 8, 8, 12, 9, 9, 9]
    runner = _ScriptedRunner()

    result = optimize.run_restart(
        optimize.OBJECTIVES["county_splits"],
        runner,
        _ScriptedScorer(splits),
        np.zeros(4, dtype=np.uint8),
        np.random.default_rng(0),
        burst_length=3,
        bursts=10,
        plateau=2,
    )

    rows, facts = result["rows"], result["facts"]
    assert runner.seeds == [0, 2, 5]
    assert rows["county_splits"].tolist() == splits
    assert rows["value"].tolist() == splits
    assert rows["burst"].tolist() == [0, 1, 1, 1, 2, 2, 2, 3, 3, 3]
    assert rows["parent"].tolist() == [-1, 0, 1, 2, 2, 4, 5, 5, 7, 8]
    assert facts["best_value"] == 8
    assert facts["best_row"] == 2
    assert facts["bursts_run"] == 3
    assert facts["stopped"] == "plateau"
    assert facts["n_visited"] == 10


def test_optimize_concatenates_restarts_and_renumbers_parents():
    splits = list(range(30, 0, -1))
    result = optimize.optimize(
        optimize.OBJECTIVES["county_splits"],
        _ScriptedRunner(),
        _ScriptedScorer(splits),
        np.zeros((5, 4), dtype=np.uint8),
        seeds=(0, 0),
        burst_length=2,
        bursts=3,
        plateau=5,
    )

    rows = result["rows"]
    assert rows["restart"].tolist() == [0] * 7 + [1] * 7
    assert rows["parent"][7] == -1
    assert rows["parent"][8] == 7
    assert [r["best_row"] for r in result["restarts"]] == [6, 13]
    assert [r["seed_plan"] for r in result["restarts"]] == [0, 0]
