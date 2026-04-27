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

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class Metric:
    key: str
    version: int
    compute: Callable[..., Any]


METRICS: tuple[Metric, ...] = ()


def hash_payload_version(metrics: tuple[Metric, ...]) -> int:
    """Deterministic 63-bit hash of the supplied manifest.

    Stable across Python versions, OS processes, and architectures
    (uses ``hashlib`` rather than the randomized built-in ``hash()``).
    """
    items = sorted((m.key, m.version) for m in metrics)
    canonical = "\n".join(f"{k}\t{v}" for k, v in items).encode("utf-8")
    digest = hashlib.sha256(canonical).digest()
    return int.from_bytes(digest[:8], "big", signed=False) & ((1 << 63) - 1)


CURRENT_PAYLOAD_VERSION: int = hash_payload_version(METRICS)
