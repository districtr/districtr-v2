"""Primitive types and response contracts for evaluation metrics.

See registry.py for the mapping of metric key to return type.
"""

from typing import Any, TypedDict, NewType

from app.utils import GeoUnitType

# ── Primitive types ───────────────────────────────────────────────────────────

Election = NewType("Election", str)
CountyGeoid = NewType("CountyGeoid", str)
DistrictId = NewType("DistrictId", int)


# ── Partisan ──────────────────────────────────────────────────────────────────

class SeatCounts(TypedDict):
    dem: int
    rep: int
    total: int


class VoteCounts(TypedDict):
    dem: int
    rep: int
    total: int


class VoteShares(TypedDict):
    dem: float
    rep: float


class CompetitiveMetrics(TypedDict):
    n_dem_districts: int
    n_rep_districts: int
    n_swing_districts: int
    n_competitive_districts: int
    n_districts: int
    n_elections: int


# ── Compactness ───────────────────────────────────────────────────────────────

class CutEdgesResult(TypedDict):
    cut_count: int
    unit_type: str

# ── Splits ───────────────────────────────────────────────────────────────────

class CountyPiecesInfo(TypedDict):
    total_pop: int
    pieces: int
    name: str

# ── Validity ──────────────────────────────────────────────────────────────────

class AssignedUnitsResult(TypedDict):
    assigned_count: int
    partially_assigned_count: int
    total_count: int
    unit_type: GeoUnitType


class PopulationDeviationResults(TypedDict):
    most_populous_district: int
    least_populous_district: int
    top_to_bottom_deviation: float
    maximal_absolute_deviation: int


class UnassignedPopulation(TypedDict):
    unassigned_population: int
    total_population: int


# ── Envelope ──────────────────────────────────────────────────────────────────

class MetricFailure(TypedDict):
    key: str
    error: str


class MetricsEnvelope(TypedDict):
    payload_version: int
    metrics: dict[str, Any]
    failed: list[MetricFailure]
