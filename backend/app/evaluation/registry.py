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

"""

import hashlib
from dataclasses import dataclass
from typing import Any, Callable

from app.evaluation.context import DocumentEvaluationContext
import app.evaluation.partisans as partisans
import app.evaluation.splits as splits
import app.evaluation.compactness as compactness
import app.evaluation.demographic as demographic
import app.evaluation.basic as basic


@dataclass(frozen=True)
class Metric:
    key: str
    version: int
    compute: Callable[[DocumentEvaluationContext], Any]


METRICS: tuple[Metric, ...] = (
    Metric(key="seats", version=1, compute=partisans.seats),
    Metric(key="efficiency_gap", version=1, compute=partisans.efficiency_gap),
    Metric(key="mean_median", version=1, compute=partisans.mean_median),
    Metric(key="partisan_bias", version=1, compute=partisans.partisan_bias),
    Metric(key="eguia", version=1, compute=partisans.eguia_county),
    Metric(key="disproportionality", version=1, compute=partisans.disproportionality),
    Metric(key="competitiveness", version=1, compute=partisans.competitive_metrics),
    Metric(key="county_pieces", version=1, compute=splits.county_pieces),
    Metric(key="cut_edges", version=1, compute=compactness.block_cut_edges),
    Metric(key="polsby_popper", version=1, compute=compactness.polsby_popper),
    Metric(key="reock", version=1, compute=compactness.reock),
    Metric(key="majority_districts", version=1, compute=demographic.majority_districts),
    Metric(key="population_deviation", version=1, compute=basic.population_deviation),
    Metric(key="assigned_units", version=5, compute=basic.assigned_units),
)


def hash_payload_version(metrics: tuple[Metric, ...]) -> int:
    """Deterministic 63-bit hash of the supplied manifest.

    Stable across Python versions, OS processes, and architectures (uses ``hashlib``
    rather than the randomized built-in ``hash()``).
    """
    items = sorted((m.key, m.version) for m in metrics)
    canonical = "\n".join(f"{k}\t{v}" for k, v in items).encode("utf-8")
    digest = hashlib.sha256(canonical).digest()
    return int.from_bytes(digest[:8], "big", signed=False) & ((1 << 63) - 1)


CURRENT_PAYLOAD_VERSION: int = hash_payload_version(METRICS)
