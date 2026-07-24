"""Tests for CountyContext's forced-minimum precompute (app.evaluation.context).

component_populations on evaluation.county_demographics is document-independent:
each county's own connected components (VTD/parent-unit adjacency, ignoring any
document/assignment) and the population of each. Used to compute the forced-
minimum split count as sum(ceil(p/ideal_pop) for p in component_populations),
a tighter bound than ceil(total_pop/ideal_pop) for counties that are themselves
already several disconnected land pieces (islands, exclaves).
"""

from datetime import datetime

from fastapi import BackgroundTasks
from networkx import Graph
from sqlmodel import Session, select

from app.evaluation.context import (
    COUNTY_CONTEXT,
    DocumentEvaluationContext,
    component_populations_for_nodes,
)
from app.evaluation.models import CountyDemographics
from app.evaluation.splits import county_pieces


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
