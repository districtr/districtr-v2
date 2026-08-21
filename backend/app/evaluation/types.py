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
    """District-level sweep/swing classification plus a flat sorted list of
    every (district, election) Dem vote share, so the frontend can apply any
    competitiveness band to the same data instead of one fixed band computed
    server-side.

    n_districts/n_elections are included even though they're derivable from
    the lists in the common case (n_districts = sum of the three list
    lengths) — carried explicitly so this metric stays self-describing and
    correct in edge cases the derived form loses, e.g. n_districts would
    read 0 rather than the real district count when there's no election
    data (n_elections == 0), and a consumer doesn't have to trust that some
    *other* metric's own election-column filtering agrees with this one's.
    """

    dem_sweep_districts: list[DistrictId]
    rep_sweep_districts: list[DistrictId]
    swing_districts: list[DistrictId]
    contest_dem_vote_shares: list[float]
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
    split_count: int
    partially_assigned_count: int
    total_count: int
    unit_type: GeoUnitType
    assigned_child_count: int | None
    total_child_count: int | None


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
