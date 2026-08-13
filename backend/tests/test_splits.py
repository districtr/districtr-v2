"""Tests for county splits metrics (app.evaluation.splits): county_pieces
(distinct district zones touching a county) and county_parts (geographically
connected components -- a district split into two disconnected areas within a
county counts as 2 parts, not 1, unlike county_pieces).

All tests use the ks_ellis_county_vtd + ks_ellis_county_block gerrydb fixtures
(Ellis County, KS — all VTDs/blocks have county FIPS 20051) with a real DB session.

county_pieces assignment scenarios:
    Three-zone: 6 VTDs, 2 per zone (1/2/3) → actual_split_pieces = 3
    Single-zone: same 6 VTDs, all zone 1  → actual_split_pieces = 1

county_parts assignment scenarios (VTD pairs chosen to be mutually adjacent in
the real ks_ellis_geos graph, and transitively connected across pairs, so the
single-zone case forms one connected component):
    Three-zone: 6 VTDs, 2 per zone (1/2/3), each pair adjacent → actual_split_parts = 3
    Single-zone: same 6 VTDs, all zone 1, transitively connected → actual_split_parts = 1

County population: 30000 (pre-seeded in COUNTY_CONTEXT cache).
"""

from datetime import datetime

import pytest
from sqlmodel import Session

from app.evaluation.context import (
    COUNTY_CONTEXT,
    CountyContext,
    CountyGeoid,
    DocumentEvaluationContext,
    GerrydbTableName,
)
from app.evaluation.splits import county_parts, county_pieces


_KS_ELLIS_TABLE = GerrydbTableName("ks_ellis_county_vtd")
_KS_ELLIS_COUNTY = CountyGeoid("20051")
_KS_ELLIS_TOTAL_POP = 30000
_KS_ELLIS_IDEAL_POP = 10000
# Rooks County, KS — real FIPS used as a phantom unassigned county in tests.
_KS_PHANTOM_COUNTY = CountyGeoid("20163")

_COUNTY_NAMES: dict[CountyGeoid, str] = {
    _KS_ELLIS_COUNTY: "Ellis County",
    _KS_PHANTOM_COUNTY: "Rooks County",
}

_THREE_ZONE_ASSIGNMENTS = [
    ["vtd:20051120060", 1],
    ["vtd:20051000280", 1],
    ["vtd:20051900090", 2],
    ["vtd:20051900010", 2],
    ["vtd:20051900100", 3],
    ["vtd:20051900070", 3],
]

_SINGLE_ZONE_ASSIGNMENTS = [
    ["vtd:20051120060", 1],
    ["vtd:20051000280", 1],
    ["vtd:20051900090", 1],
    ["vtd:20051900010", 1],
    ["vtd:20051900100", 1],
    ["vtd:20051900070", 1],
]

_PARTS_THREE_ZONE_ASSIGNMENTS = [
    ["vtd:2005100003A", 1],
    ["vtd:20051000240", 1],
    ["vtd:20051000230", 2],
    ["vtd:20051000220", 2],
    ["vtd:20051120050", 3],
    ["vtd:20051900040", 3],
]

_PARTS_SINGLE_ZONE_ASSIGNMENTS = [
    ["vtd:2005100003A", 1],
    ["vtd:20051000240", 1],
    ["vtd:20051000230", 1],
    ["vtd:20051000220", 1],
    ["vtd:20051120050", 1],
    ["vtd:20051900040", 1],
]


class _StubSplitsContext(DocumentEvaluationContext):
    """Real-session context that injects gerrydb_table and ideal_population directly,
    bypassing the DB lookups for those cached properties."""

    def __init__(
        self,
        session,
        document_id,
        parent_layer=_KS_ELLIS_TABLE,
        ideal_population=_KS_ELLIS_IDEAL_POP,
    ):
        super().__init__(
            background_tasks=None, session=session, document_id=document_id
        )  # type: ignore[arg-type]
        self.__dict__["district_stats"] = []
        self.__dict__["parent_layer"] = parent_layer
        self.__dict__["ideal_population"] = ideal_population


def _put_assignments(client, document_id, assignments):
    resp = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": assignments,
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert resp.status_code == 200


def _create_context(client, session, assignments, ideal_population=_KS_ELLIS_IDEAL_POP):
    """Create a document, insert assignments, pre-seed county pops, return a context."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    _put_assignments(client, document_id, assignments)
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {_KS_ELLIS_COUNTY: _KS_ELLIS_TOTAL_POP}
    COUNTY_CONTEXT._name_cache.update(_COUNTY_NAMES)
    return _StubSplitsContext(
        session, document_id=document_id, ideal_population=ideal_population
    )


def _create_parts_context(
    client, session, assignments, ideal_population=_KS_ELLIS_IDEAL_POP
):
    """Like _create_context, but also pre-seeds _component_pop_cache directly
    (bypassing the DB) since the real ks_ellis fixture table has no
    total_pop_20 column (it's a VAP fixture) -- component_populations() would
    otherwise trigger a real, failing query. Ellis County isn't an
    island/exclave, so one component matching the total population is the
    correct value, not just a test convenience.
    """
    ctx = _create_context(client, session, assignments, ideal_population)
    COUNTY_CONTEXT._component_pop_cache[_KS_ELLIS_TABLE] = {
        _KS_ELLIS_COUNTY: [_KS_ELLIS_TOTAL_POP]
    }
    return ctx


def _cleanup_county_context():
    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._component_pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._name_cache.clear()


@pytest.fixture
def three_zone_context(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    yield _create_context(client, session, _THREE_ZONE_ASSIGNMENTS)
    _cleanup_county_context()


@pytest.fixture
def single_zone_context(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    yield _create_context(client, session, _SINGLE_ZONE_ASSIGNMENTS)
    _cleanup_county_context()


@pytest.fixture
def three_zone_parts_context(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
    mock_grid_graph_file,
):
    yield _create_parts_context(client, session, _PARTS_THREE_ZONE_ASSIGNMENTS)
    _cleanup_county_context()


@pytest.fixture
def single_zone_parts_context(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
    mock_grid_graph_file,
):
    yield _create_parts_context(client, session, _PARTS_SINGLE_ZONE_ASSIGNMENTS)
    _cleanup_county_context()


# ═══════════════════════════════════════════════════════════════════════════
# county_pieces: distinct district zones touching a county
# ═══════════════════════════════════════════════════════════════════════════

# ── Actual split pieces ───────────────────────────────────────────────────────


def test_county_pieces_actual_three_zones(three_zone_context):
    """2 VTDs each in 3 zones → actual = 3 for Ellis County."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY]["pieces"] == 3


def test_county_pieces_actual_single_zone(single_zone_context):
    """All assigned VTDs in one zone → actual = 1."""
    result = county_pieces(single_zone_context)
    assert result[_KS_ELLIS_COUNTY]["pieces"] == 1


def test_county_pieces_name(three_zone_context):
    """name field is the Census county name."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY]["name"] == "Ellis County"


def test_county_pieces_unassigned_county_zero(three_zone_context):
    """A county absent from assignments has pieces = 0."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert result[phantom]["pieces"] == 0


# ── Population ───────────────────────────────────────────────────────────────


def test_county_pieces_population(three_zone_context):
    """total_pop field is the county population."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY]["total_pop"] == _KS_ELLIS_TOTAL_POP


# ── Retesting for old bug: cold cache + shatterable map ──────────────────────────────
def test_county_pieces_cold_cache_shatterable_map(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    """county_pieces must work on a cold cache when the map is shatterable.

    The old bug: county_pieces passes context.gerrydb_table (the combined
    materialized view, relkind='m') to county_populations, which trips the
    relkind != 'r' guard in _populate_county_data.
    """
    _KS_ELLIS_PARENT_LAYER = GerrydbTableName("ks_ellis_county_vtd")
    _cleanup_county_context()
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_PARENT_LAYER] = {
        _KS_ELLIS_COUNTY: _KS_ELLIS_TOTAL_POP
    }
    COUNTY_CONTEXT._name_cache.update(_COUNTY_NAMES)
    try:
        resp = client.post(
            "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
        )
        assert resp.status_code == 201
        document_id = resp.json()["document_id"]
        _put_assignments(client, document_id, _THREE_ZONE_ASSIGNMENTS)

        ctx = _StubSplitsContext(session, document_id=document_id)

        result = county_pieces(ctx)
        assert result[_KS_ELLIS_COUNTY]["pieces"] == 3
    finally:
        COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_PARENT_LAYER, None)
        COUNTY_CONTEXT._attempts.pop(_KS_ELLIS_PARENT_LAYER, None)


def test_county_pieces_unassigned_county_population(three_zone_context):
    """A county absent from assignments still reports its population."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert result[phantom]["total_pop"] == 5000


def test_county_pieces_keyed_by_county_pops(three_zone_context):
    """Result contains exactly the counties present in county_pops."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert set(result.keys()) == {_KS_ELLIS_COUNTY, phantom}


# ── COUNTY_CONTEXT guard behavior ────────────────────────────────────────────


def test_county_pieces_empty_when_no_county_pops(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    """Returns {} immediately when county_pops is empty."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    _put_assignments(client, document_id, _THREE_ZONE_ASSIGNMENTS)
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {}
    try:
        ctx = _StubSplitsContext(session, document_id=document_id)
        assert county_pieces(ctx) == {}
    finally:
        _cleanup_county_context()


def test_county_pieces_raises_when_attempts_exhausted(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    """Raises ValueError when county_populations has exhausted all load attempts."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts[_KS_ELLIS_TABLE] = CountyContext.MAX_LOAD_ATTEMPTS
    try:
        ctx = _StubSplitsContext(session, document_id=document_id)
        with pytest.raises(ValueError):
            county_pieces(ctx)
    finally:
        _cleanup_county_context()


# ═══════════════════════════════════════════════════════════════════════════
# county_parts: geographically connected components
# ═══════════════════════════════════════════════════════════════════════════

# ── Actual split parts ────────────────────────────────────────────────────────


def test_county_parts_actual_three_zones(three_zone_parts_context):
    """2 VTDs each in 3 zones, each pair adjacent → actual = 3 for Ellis County."""
    result = county_parts(three_zone_parts_context)
    assert result[_KS_ELLIS_COUNTY]["parts"] == 3


def test_county_parts_actual_single_zone(single_zone_parts_context):
    """All assigned VTDs in one zone, transitively connected → actual = 1."""
    result = county_parts(single_zone_parts_context)
    assert result[_KS_ELLIS_COUNTY]["parts"] == 1


def test_county_parts_disconnected_same_zone_counts_as_two(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
    mock_grid_graph_file,
):
    """Regression guard: one zone split into two disconnected areas within a
    county must count as 2 parts, not 1. VTDs 900090 and 900070 are both in
    Ellis County but not adjacent (confirmed against the real ks_ellis_geos
    graph), and no other assigned unit bridges them, so the same-zone
    assignment below must yield 2 connected components."""
    try:
        ctx = _create_parts_context(
            client,
            session,
            [
                ["vtd:20051900090", 1],
                ["vtd:20051900070", 1],
            ],
        )
        result = county_parts(ctx)
        assert result[_KS_ELLIS_COUNTY]["parts"] == 2
    finally:
        _cleanup_county_context()


def test_county_parts_name(three_zone_parts_context):
    """name field is the Census county name."""
    result = county_parts(three_zone_parts_context)
    assert result[_KS_ELLIS_COUNTY]["name"] == "Ellis County"


def test_county_parts_unassigned_county_zero(three_zone_parts_context):
    """A county absent from assignments has parts = 0."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_parts(three_zone_parts_context)
    assert result[phantom]["parts"] == 0


# ── Population ───────────────────────────────────────────────────────────────


def test_county_parts_population(three_zone_parts_context):
    """total_pop field is the county population."""
    result = county_parts(three_zone_parts_context)
    assert result[_KS_ELLIS_COUNTY]["total_pop"] == _KS_ELLIS_TOTAL_POP


# ── Retesting for old bug: shatterable map's aggregation source ──────────────
def test_county_parts_shatterable_map(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
    mock_grid_graph_file,
):
    """county_parts must work correctly on a shatterable map.

    The old bug (on county_pieces, before this metric was split off): passing
    context.gerrydb_table (the combined materialized view, relkind='m')
    straight through as the aggregation source trips the relkind != 'r' guard
    in _populate_county_data. county_parts calls county_populations with
    context.parent_layer (the real VTD base table), same as county_pieces and
    eguia_county always have.
    """
    _cleanup_county_context()
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {_KS_ELLIS_COUNTY: _KS_ELLIS_TOTAL_POP}
    COUNTY_CONTEXT._component_pop_cache[_KS_ELLIS_TABLE] = {
        _KS_ELLIS_COUNTY: [_KS_ELLIS_TOTAL_POP]
    }
    COUNTY_CONTEXT._name_cache.update(_COUNTY_NAMES)
    try:
        resp = client.post(
            "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
        )
        assert resp.status_code == 201
        document_id = resp.json()["document_id"]
        _put_assignments(client, document_id, _PARTS_THREE_ZONE_ASSIGNMENTS)

        ctx = _StubSplitsContext(session, document_id=document_id)

        result = county_parts(ctx)
        assert result[_KS_ELLIS_COUNTY]["parts"] == 3
    finally:
        _cleanup_county_context()


def test_county_parts_unassigned_county_population(three_zone_parts_context):
    """A county absent from assignments still reports its population."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_parts(three_zone_parts_context)
    assert result[phantom]["total_pop"] == 5000


def test_county_parts_keyed_by_county_pops(three_zone_parts_context):
    """Result contains exactly the counties present in county_populations."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_parts(three_zone_parts_context)
    assert set(result.keys()) == {_KS_ELLIS_COUNTY, phantom}


def test_county_parts_raises_on_assigned_county_missing_from_pops(
    three_zone_parts_context,
):
    """An assigned geo_id whose county has no entry in total_pop (e.g. every
    unit in that county missing total_pop_20, so county_populations() filtered
    it out) is a data-integrity problem, not something to silently skip --
    county_parts_count is pre-seeded from total_pop's keys only, so an
    unrecognized county_geoid raises KeyError rather than being silently
    ignored.

    total_pop must stay non-empty here (otherwise the "not county_pops"
    early-return short-circuits before this code path is reached) but must
    not contain the Ellis County key the assignments actually resolve to.
    """
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {_KS_PHANTOM_COUNTY: 5000}
    with pytest.raises(KeyError):
        county_parts(three_zone_parts_context)


# ── COUNTY_CONTEXT guard behavior ────────────────────────────────────────────


def test_county_parts_empty_when_no_county_pops(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    """Returns {} immediately when total_pop is empty."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    _put_assignments(client, document_id, _PARTS_THREE_ZONE_ASSIGNMENTS)
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {}
    try:
        ctx = _StubSplitsContext(session, document_id=document_id)
        assert county_parts(ctx) == {}
    finally:
        _cleanup_county_context()


def test_county_parts_raises_when_attempts_exhausted(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    """Raises ValueError when county_populations has exhausted all load attempts."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts[_KS_ELLIS_TABLE] = CountyContext.MAX_LOAD_ATTEMPTS
    try:
        ctx = _StubSplitsContext(session, document_id=document_id)
        with pytest.raises(ValueError):
            county_parts(ctx)
    finally:
        _cleanup_county_context()
