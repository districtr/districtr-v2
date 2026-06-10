"""``METRICS`` is the canonical, immutable tuple of every metric the
backend computes for the document evaluation table. Please update ``METRICS''
when adding or removing a metric.

``CURRENT_PAYLOAD_VERSION`` is a deterministic 63-bit integer derived from the
SHA-256 of ``METRICS`` in canonical sorted order.  It should be stamped into
``document.evaluation.payload_version`` on every write.  An evaluation row whose
stored version differs from this value is treated as stale and recomputed on the
next read.

``CURRENT_PAYLOAD_VERSION`` flips when:

- a metric is added or removed (the key set changes),
- a metric's per-metric ``version`` is bumped, when we want to change a formula
  or output shape in a way that
should invalidate caches,

Manual integration test
-----------------------
Any change to ``METRICS`` — adding, removing, or version-bumping an entry —
should be accompanied by a manual run of the Florida Cong2026 integration test::

    pytest backend/tests/test_fl_metrics_integration.py -v

That suite validates every metric against ground-truth values from the Duchin
May 2026 report on Florida Congressional Redistricting.  It is intentionally
excluded from CI because it requires large geodata files not stored in the
repository (see the test module for setup instructions).

"""

import hashlib
from dataclasses import dataclass
from typing import Any, Callable, Generic, TypeVar

from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.types import (
    CompetitiveMetrics,
    CountyGeoid,
    CountyPiecesInfo,
    CutEdgesResult,
    DistrictId,
    Election,
    PopulationDeviationResults,
    SeatCounts,
    UnassignedPopulation,
    VoteCounts,
    VoteShares,
    AssignedUnitsResult,
)
import app.evaluation.partisans as partisans
import app.evaluation.splits as splits
import app.evaluation.compactness as compactness
import app.evaluation.validity as validity

T = TypeVar("T")


@dataclass(frozen=True)
class Metric(Generic[T]):
    key: str
    version: int
    compute: Callable[[DocumentEvaluationContext], T]


METRICS: tuple[Metric[Any], ...] = (
    Metric[dict[Election, SeatCounts]](key="seats", version=1, compute=partisans.seats),
    Metric[dict[Election, VoteCounts]](key="votes", version=1, compute=partisans.votes),
    Metric[dict[Election, VoteShares]](
        key="vote_shares", version=1, compute=partisans.vote_shares
    ),
    Metric[dict[Election, float]](
        key="efficiency_gap", version=1, compute=partisans.efficiency_gap
    ),
    Metric[dict[Election, float]](
        key="mean_median", version=1, compute=partisans.mean_median
    ),
    Metric[dict[Election, float]](
        key="partisan_bias", version=1, compute=partisans.partisan_bias
    ),
    Metric[dict[Election, float]](
        key="eguia", version=1, compute=partisans.eguia_county
    ),
    Metric[dict[Election, float]](
        key="disproportionality", version=1, compute=partisans.disproportionality
    ),
    Metric[CompetitiveMetrics](
        key="competitiveness", version=1, compute=partisans.competitive_metrics
    ),
    Metric[int](key="ideal_population", version=1, compute=validity.ideal_population),
    Metric[dict[CountyGeoid, CountyPiecesInfo]](
        key="county_pieces", version=1, compute=splits.county_pieces
    ),
    Metric[dict[DistrictId, list[CountyGeoid]]](
        key="district_county_membership",
        version=1,
        compute=splits.district_county_membership,
    ),
    Metric[CutEdgesResult](
        key="cut_edges", version=1, compute=compactness.block_cut_edges
    ),
    Metric[dict[DistrictId, float]](
        key="polsby_popper", version=1, compute=compactness.polsby_popper
    ),
    Metric[dict[DistrictId, float]](key="reock", version=1, compute=compactness.reock),
    Metric[PopulationDeviationResults](
        key="population_deviation", version=1, compute=validity.population_deviation
    ),
    Metric[AssignedUnitsResult](
        key="assigned_units", version=1, compute=validity.assigned_units
    ),
    Metric[UnassignedPopulation](
        key="unassigned_population", version=1, compute=validity.unassigned_population
    ),
    Metric[dict[DistrictId, bool]](
        key="contiguous", version=1, compute=validity.contiguous
    ),
)


def hash_payload_version(metrics: tuple[Metric[Any], ...]) -> int:
    """Deterministic 63-bit hash of the supplied manifest.

    Stable across Python versions, OS processes, and architectures (uses ``hashlib``
    rather than the randomized built-in ``hash()``).
    """
    items = sorted((m.key, m.version) for m in metrics)
    canonical = "\n".join(f"{k}\t{v}" for k, v in items).encode("utf-8")
    digest = hashlib.sha256(canonical).digest()
    return int.from_bytes(digest[:8], "big", signed=False) & ((1 << 63) - 1)


CURRENT_PAYLOAD_VERSION: int = hash_payload_version(METRICS)
