"""Tests for CountyContext (app.evaluation.context) — the singleton behind both
the Eguia metric's county ideals and the county-pieces forced-minimum precompute.

component_populations on evaluation.county_demographics is document-independent:
each county's own connected components (VTD/parent-unit adjacency, ignoring any
document/assignment) and the population of each. Used to compute the forced-
minimum split count as sum(ceil(p/ideal_pop) for p in component_populations),
a tighter bound than ceil(total_pop/ideal_pop) for counties that are themselves
already several disconnected land pieces (islands, exclaves).

The ideals_for_eguia / _ensure_county_data / _populate_county_data unit tests
below were relocated from test_partisan.py, where they'd accumulated simply
because CountyContext originally existed to serve the Eguia metric — they test
CountyContext itself, not partisan scoring, so they belong here. Genuinely
eguia-metric integration tests (calling eguia_county() and asserting on its
behavior) stay in test_partisan.py.
"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi import BackgroundTasks
from networkx import Graph
from sqlalchemy import text as sqlmodel_text
from sqlmodel import Session, select

from app.evaluation.context import (
    COUNTY_CONTEXT,
    CountyContext,
    DocumentEvaluationContext,
    GerrydbTableName,
    component_populations_for_nodes,
)
from app.evaluation.models import CountyDemographics
from app.evaluation.splits import county_pieces

_STUB_TABLE = GerrydbTableName("test_table")


def test_component_populations_for_nodes_single_component():
    G = Graph()
    G.add_edge("a", "b")
    G.add_edge("b", "c")
    populations = {"a": 100, "b": 200, "c": 300}
    assert component_populations_for_nodes(G, populations) == [600]


def test_component_populations_for_nodes_disconnected():
    """A county with two disconnected land pieces reports two population totals,
    not one combined total — the whole point of this precompute."""
    G = Graph()
    G.add_edge("a", "b")
    G.add_node("c")  # isolated, no edges -- its own component
    populations = {"a": 100, "b": 200, "c": 50}
    result = component_populations_for_nodes(G, populations)
    assert sorted(result) == [50, 300]


def test_component_populations_for_nodes_ignores_unlisted_nodes():
    """Only nodes present in population_by_node are included, even if G has more."""
    G = Graph()
    G.add_edge("a", "b")
    G.add_edge("b", "c")
    populations = {"a": 100, "c": 300}  # "b" omitted
    result = component_populations_for_nodes(G, populations)
    # "a" and "c" are only connected through "b", which isn't in the node set.
    assert sorted(result) == [100, 300]


# ── ideals_for_eguia: retry/cache behavior (relocated from test_partisan.py) ──


def test_ideals_for_eguia_retries_then_gives_up():
    """Failures are retried up to MAX_LOAD_ATTEMPTS times; subsequent calls
    raise immediately without hitting the DB."""
    table = GerrydbTableName(_STUB_TABLE)
    singleton = CountyContext()
    singleton._ensure_county_data = MagicMock()
    mock_compute = MagicMock(side_effect=ValueError("no data"))
    singleton._compute_ideal = mock_compute

    for attempt in range(1, CountyContext.MAX_LOAD_ATTEMPTS + 1):
        with pytest.raises(ValueError):
            singleton.ideals_for_eguia(table, MagicMock())
        assert mock_compute.call_count == attempt

    # After exhausting attempts, raises without additional DB work.
    with pytest.raises(ValueError, match="failed to load after"):
        singleton.ideals_for_eguia(table, MagicMock())
    assert mock_compute.call_count == CountyContext.MAX_LOAD_ATTEMPTS


def test_ideals_for_eguia_recovers_after_transient_failure():
    """A transient failure on one attempt doesn't block a later successful
    attempt; once recovered, the result is permanently cached and _compute_ideal
    is never called again."""
    table = GerrydbTableName(_STUB_TABLE)
    good_ideals = {"pres_2020_dem": 0.6, "pres_2020_rep": 0.4}
    singleton = CountyContext()
    singleton._ensure_county_data = MagicMock()
    mock_compute = MagicMock(side_effect=[ValueError("transient"), good_ideals])
    singleton._compute_ideal = mock_compute

    with pytest.raises(ValueError):
        singleton.ideals_for_eguia(table, MagicMock())
    assert singleton._attempts[table] == 1

    assert singleton.ideals_for_eguia(table, MagicMock()) == good_ideals
    assert singleton._cache[table] == good_ideals

    # All further calls hit the cache — _compute_ideal is not called again.
    assert singleton.ideals_for_eguia(table, MagicMock()) == good_ideals
    assert mock_compute.call_count == 2


# ── _ensure_county_data (relocated from test_partisan.py) ─────────────────────


def test_ensure_county_data_calls_populate_when_no_valid_rows():
    """_ensure_county_data triggers _populate_county_data when no row with
    non-null total_pop exists (covers both the no-rows and null-total_pop cases)."""
    table = GerrydbTableName(_STUB_TABLE)
    singleton = CountyContext()
    mock_populate = MagicMock()
    singleton._populate_county_data = mock_populate

    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = None

    singleton._ensure_county_data(table, mock_session)

    mock_populate.assert_called_once_with(table, mock_session)


def test_ensure_county_data_skips_populate_when_valid_rows_exist():
    """_ensure_county_data is a no-op when a row with non-null total_pop exists."""
    table = GerrydbTableName(_STUB_TABLE)
    singleton = CountyContext()
    mock_populate = MagicMock()
    singleton._populate_county_data = mock_populate

    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = MagicMock()

    singleton._ensure_county_data(table, mock_session)

    mock_populate.assert_not_called()


# ── _populate_county_data: materialized-view guard (relocated from test_partisan.py) ──
#
# Retesting for a past bug: eguia county aggregation must use parent_layer (VTD
# base table), not the shatterable UNION ALL materialized view.


def test_populate_county_data_rejects_materialized_view(
    session, gerrydb_ks_ellis_geos_view
):
    """_populate_county_data must raise for materialized views.

    The shatterable gerrydb view (ks_ellis_geos) is a UNION ALL of VTD and
    block rows. Inserting from it would double-count every county.
    The pg_class.relkind guard must raise rather than silently skip.
    """
    shatterable_view = GerrydbTableName("ks_ellis_geos")

    with pytest.raises(ValueError, match="plain table"):
        CountyContext()._populate_county_data(shatterable_view, session)


def test_simple_geos_county_demographics_component_populations(
    session: Session,
    simple_shatterable_districtr_map,
    gerrydb_simple_geos_view,
    mock_grid_graph_file,
):
    """simple_parent_geos: 3 VTDs (600/900/600 pop), all mutually adjacent in the
    real simple_geos graph, all county "00001" -> one connected component summing
    to total_pop (2100). Confirms the SQL wiring end-to-end; the disconnected-case
    math itself is covered by the pure unit tests above."""
    parent_layer = "simple_parent_geos"
    try:
        COUNTY_CONTEXT._populate_county_data(parent_layer, session)

        row = session.exec(
            select(CountyDemographics).where(
                CountyDemographics.geoid == "00001",
                CountyDemographics.gerrydb_table_name == parent_layer,
            )
        ).one()

        assert row.total_pop == 2100
        assert row.component_populations == [2100]
    finally:
        COUNTY_CONTEXT._pop_cache.pop(parent_layer, None)
        COUNTY_CONTEXT._attempts.pop(parent_layer, None)


def test_populate_component_populations_raises_when_no_districtrmap(
    session: Session,
):
    """No DistrictrMap references this parent_layer at all -> can't resolve a
    graph name -> raise, not silently skip."""
    with pytest.raises(ValueError):
        COUNTY_CONTEXT._populate_component_populations(
            "no_such_parent_layer", "no_such_parent_layer", session
        )


def test_ensure_county_data_backfills_missing_component_populations(
    session: Session,
    simple_shatterable_districtr_map,
    gerrydb_simple_geos_view,
    mock_grid_graph_file,
):
    """A pre-existing row with total_pop set but component_populations still NULL
    (e.g. written before this column existed) gets backfilled on next access,
    rather than being permanently treated as "already done"."""
    parent_layer = "simple_parent_geos"
    try:
        session.execute(
            sqlmodel_text(
                "INSERT INTO evaluation.county_demographics "
                "(geoid, gerrydb_table_name, total_pop, demographic_data) "
                "VALUES ('00001', :parent_layer, 2100, '{}') "
                "ON CONFLICT (geoid, gerrydb_table_name) DO NOTHING"
            ),
            {"parent_layer": parent_layer},
        )
        session.commit()

        row = session.exec(
            select(CountyDemographics).where(
                CountyDemographics.geoid == "00001",
                CountyDemographics.gerrydb_table_name == parent_layer,
            )
        ).one()
        assert row.component_populations is None  # pre-existing, unbackfilled

        COUNTY_CONTEXT._ensure_county_data(parent_layer, session)

        session.expire_all()
        row = session.exec(
            select(CountyDemographics).where(
                CountyDemographics.geoid == "00001",
                CountyDemographics.gerrydb_table_name == parent_layer,
            )
        ).one()
        assert row.component_populations == [2100]
    finally:
        COUNTY_CONTEXT._pop_cache.pop(parent_layer, None)
        COUNTY_CONTEXT._attempts.pop(parent_layer, None)


def test_county_pieces_includes_component_populations(
    client,
    session: Session,
    simple_shatterable_districtr_map,
    gerrydb_simple_geos_view,
    mock_grid_graph_file,
):
    """county_pieces()'s returned CountyPiecesInfo carries component_populations
    end-to-end (forced-minimum input), independent of pieces/total_pop."""
    parent_layer = "simple_parent_geos"
    COUNTY_CONTEXT._name_cache["00001"] = "Test County"
    try:
        resp = client.post(
            "/api/create_document", json={"districtr_map_slug": "simple_geos"}
        )
        assert resp.status_code == 201
        document_id = resp.json()["document_id"]
        client.put(
            "/api/assignments",
            json={
                "document_id": document_id,
                "assignments": [["vtd:000010000001", 1]],
                "last_updated_at": datetime.now().astimezone().isoformat(),
            },
        )

        ctx = DocumentEvaluationContext(
            background_tasks=BackgroundTasks(), session=session, document_id=document_id
        )
        result = county_pieces(ctx)
        assert result["00001"]["component_populations"] == [2100]
    finally:
        COUNTY_CONTEXT._pop_cache.pop(parent_layer, None)
        COUNTY_CONTEXT._component_pop_cache.pop(parent_layer, None)
        COUNTY_CONTEXT._attempts.pop(parent_layer, None)
        COUNTY_CONTEXT._name_cache.pop("00001", None)
