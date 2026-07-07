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


def poisson_offsets(n: int, window: float, seed: int, label: str) -> list[float]:
    """Session-start offsets for a Poisson arrival process: cumulative sum of
    exponential inter-arrival times with rate n/window."""
    rng = _rng(seed, label)
    rate = n / window
    offsets, t = [], 0.0
    for _ in range(n):
        t += rng.expovariate(rate)
        offsets.append(t)
    return offsets


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
