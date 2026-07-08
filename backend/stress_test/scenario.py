"""Traffic-model constants and pre-sampled arrival-time schedules.

All sampling uses `random.Random` seeded from STRESS_RNG_SEED (plus a
population label) so runs are reproducible (STRESS_TEST_PLAN.md §3/§4).
"""

import random

# Full-scale population counts (STRESS_TEST_PLAN.md §3); multiplied by SCALE.
VIEWERS = 10_000
EVAL_USERS = 2_500
EDITORS = 250
EDITOR_EVAL_FRACTION = 50 / 250  # subset of editors that also run /evaluation
PLANS_PER_EDITOR = 3
SAVES_PER_EDITOR = 3
# Fraction of assignment rows an editor perturbs per save (so payloads aren't
# byte-identical and updated_at advances).
PERTURB_FRACTION = 0.01


def scaled(count: int, scale: float) -> int:
    return max(1, round(count * scale))


def _rng(seed: int, label: str) -> random.Random:
    return random.Random(f"{seed}:{label}")


# Non-homogeneous arrival intensity shape: a Beta(ALPHA, BETA) density over
# the window — sharp early ramp peaking (ALPHA-1)/(ALPHA+BETA-2) of the way in
# (20% here), then a long decay tail. Raise BETA for an earlier, spikier peak.
ARRIVAL_ALPHA = 2.0
ARRIVAL_BETA = 5.0


def poisson_offsets(n: int, window: float, seed: int, label: str) -> list[float]:
    """Exactly n session-start offsets in [0, window), distributed as a
    non-homogeneous Poisson process conditioned on n arrivals, with intensity
    proportional to a Beta(ARRIVAL_ALPHA, ARRIVAL_BETA) density (spiky early
    ramp, then decay). Conditioned on the count, arrivals of a non-homogeneous
    Poisson process are i.i.d. draws from the normalized intensity — i.e. n
    Beta variates scaled to the window, sorted."""
    rng = _rng(seed, label)
    return sorted(
        rng.betavariate(ARRIVAL_ALPHA, ARRIVAL_BETA) * window for _ in range(n)
    )


def uniform_offsets(n: int, window: float, seed: int, label: str) -> list[float]:
    """Session-start offsets sampled uniformly over the window."""
    rng = _rng(seed, label)
    return sorted(rng.uniform(0, window) for _ in range(n))


def editor_save_times(
    start: float, window: float, seed: int, editor_idx: int
) -> list[float]:
    """SAVES_PER_EDITOR save times, uniform between session start and window end."""
    rng = _rng(seed, f"editor-saves:{editor_idx}")
    end = max(window, start + 1)
    return sorted(rng.uniform(start, end) for _ in range(SAVES_PER_EDITOR))
