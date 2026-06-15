from fastapi.testclient import TestClient
from pytest import fixture
from networkx import Graph

import pickle
from app.contiguity.main import (
    check_subgraph_contiguity,
    subgraph_number_connected_components,
    get_assigned_nodes,
)
import app.evaluation.graph as graph
from app.models import DistrictrMap
from app.utils import create_parent_child_edges
from tests.constants import FIXTURES_PATH
from sqlmodel import Session
from datetime import datetime


@fixture
def connected_graph():
    G = Graph()
    # a - b
    # |   |
    # d - c
    G.add_edge("a", "b")
    G.add_edge("b", "c")
    G.add_edge("c", "d")
    G.add_edge("d", "a")
    return G


def test_check_subgraph_contiguity(connected_graph):
    assert check_subgraph_contiguity(connected_graph, ["a", "b", "c", "d"])
    assert check_subgraph_contiguity(connected_graph, ["a", "b", "c"])
    assert check_subgraph_contiguity(connected_graph, ["a", "b", "d"])
    assert check_subgraph_contiguity(connected_graph, ["a", "b"])
    assert check_subgraph_contiguity(connected_graph, ["a"])
    assert not check_subgraph_contiguity(connected_graph, ["a", "c"])


def test_check_subgraph_number_connected_components(connected_graph):
    assert (
        subgraph_number_connected_components(connected_graph, ["a", "b", "c", "d"]) == 1
    )
    assert subgraph_number_connected_components(connected_graph, ["a", "b", "c"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "b", "d"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "b"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "c"]) == 2


def test_load_pkl(connected_graph, tmp_path):
    pkl_path = tmp_path / "test_graph.pkl"
    with open(pkl_path, "wb") as f:
        pickle.dump(connected_graph, f)
    with open(pkl_path, "rb") as f:
        G = pickle.load(f)
    test_check_subgraph_contiguity(G)


def put_simple_contiguous_assignments(client: TestClient, document_id: str):
    client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["vtd:000010000001", 1],
                ["vtd:000010000002", 2],
                ["vtd:000010000003", 1],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )


# simple_geos graph topology (see fixtures/graph/simple_geos.pkl):
#
#   Parents (vtd:)        Children (15-digit block)
#   vtd:...001 – vtd:...003       ...001 – ...005 – ...006
#   |            |                |        |        |
#   vtd:...002 ––                 ...003 – ...002 ––
#                                 |        |
#                                 ...004 ––
#
#   vtd:...001 = { ...001, ...005 }
#   vtd:...002 = { ...002, ...003, ...004 }
#   vtd:...003 = { ...006 }


# Idem in test_utils.py
@fixture(name="document_id")
def document_id_fixture(
    client, session: Session, simple_shatterable_districtr_map, gerrydb_simple_geos_view
):
    response = client.post(
        "/api/create_document",
        json={"districtr_map_slug": "simple_geos"},
    )
    assert response.status_code == 201
    doc = response.json()

    return doc["document_id"]


@fixture(name="simple_contiguous_assignments")
def simple_contigous_assignments(client: TestClient, document_id: str) -> str:
    put_simple_contiguous_assignments(client, document_id)

    return document_id


def test_all_zones_contiguous(
    session: Session,
    simple_contiguous_assignments: str,
    simple_shatterable_districtr_map: str,
):
    """Both zones are contiguous when checked against the combined simple_geos graph."""
    document_id = simple_contiguous_assignments
    districtr_map = session.get(DistrictrMap, simple_shatterable_districtr_map)
    zone_assignments = get_assigned_nodes(session, document_id, districtr_map)
    G = graph.get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.pkl"))
    for zone in zone_assignments:
        assert check_subgraph_contiguity(G, zone.nodes)


def test_subset_of_zones_contiguous(
    session: Session,
    simple_contiguous_assignments: str,
    simple_shatterable_districtr_map: str,
):
    """Zone 1 is contiguous when filtered and checked against the combined graph."""
    document_id = simple_contiguous_assignments
    districtr_map = session.get(DistrictrMap, simple_shatterable_districtr_map)
    (zone_assignment,) = get_assigned_nodes(
        session, document_id, districtr_map, zones=[1]
    )
    G = graph.get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.pkl"))
    assert check_subgraph_contiguity(G, zone_assignment.nodes)


@fixture
def mock_gerrydb_graph_file(monkeypatch):
    def mock_get_file(gerrydb_name: str) -> str:
        return f"{FIXTURES_PATH}/graph/{gerrydb_name}.pkl"

    monkeypatch.setattr(graph, "get_gerrydb_graph_file", mock_get_file)


def test_simple_geos_contiguity(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1}


def test_simple_geos_contiguity_single_zone(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity?zone=1",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1}


def test_simple_geos_contiguity_subgraph_bboxes(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity/1/connected_component_bboxes",
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["features"]) == 1


def test_simple_geos_contiguity_subgraph_bboxes_nonexistent_zone(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity/3/connected_component_bboxes",
    )
    assert response.status_code == 404
    data = response.json()
    assert data["detail"] == "Zone not found"


def test_simple_geos_discontiguity(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    put_simple_contiguous_assignments(client, document_id)
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1}

    # Break one parent and create discontiguous assignments
    # See simple_geos graph topology comment above and
    # `simple_contigous_assignments` fixture for existing assignments
    assert response.status_code == 200
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["000010000000001", 1],
                ["000010000000005", 2],
                ["vtd:000010000002", 2],
                ["vtd:000010000003", 1],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 2, "2": 1}


def test_simple_geos_discontiguity_subgraph_bboxes(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1}

    # Break one parent and create discontiguous assignments
    # See simple_geos graph topology comment above and
    # `simple_contigous_assignments` fixture for existing assignments
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["000010000000001", 1],
                ["000010000000005", 2],
                ["vtd:000010000002", 2],
                ["vtd:000010000003", 1],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/document/{document_id}/contiguity/1/connected_component_bboxes",
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["features"]) == 2


@fixture
def ks_ellis_document_id(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    create_parent_child_edges(
        session=session, districtr_map_uuid=ks_ellis_shatterable_districtr_map
    )
    response = client.post(
        "/api/create_document",
        json={"districtr_map_slug": "ks_ellis_geos"},
    )
    assert response.status_code == 201
    doc = response.json()

    return doc["document_id"]


@fixture
def ks_ellis_assignments(client: TestClient, ks_ellis_document_id: str) -> str:
    document_id = ks_ellis_document_id
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["vtd:20051120060", 1],
                ["vtd:20051000280", 1],
                ["vtd:20051000050", 1],
                ["vtd:20051000040", 1],
                ["vtd:20051900090", 2],
                ["vtd:20051900010", 2],
                ["vtd:20051120070", 2],
                ["vtd:20051120050", 2],
                ["vtd:20051120040", 2],
                ["vtd:20051000310", 2],
                ["vtd:20051000300", 2],
                ["vtd:20051000290", 2],
                ["vtd:2005100010A", 2],
                ["vtd:20051000090", 2],
                ["vtd:20051000080", 2],
                ["vtd:20051000030", 2],
                ["vtd:20051900100", 3],
                ["vtd:20051900070", 3],
                ["vtd:20051900060", 3],
                ["vtd:20051900050", 3],
                ["vtd:20051000240", 3],
                ["vtd:20051000230", 3],
                ["vtd:20051000220", 3],
                ["vtd:2005100021A", 3],
                ["vtd:20051000200", 3],
                ["vtd:2005100003A", 3],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200

    return document_id


def test_ks_ellis_geos_contiguity(
    client: TestClient,
    ks_ellis_assignments: str,
    mock_gerrydb_graph_file,
):
    document_id = ks_ellis_assignments

    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1, "3": 2}


def test_fix_ks_ellis_geos_contiguity(
    client: TestClient,
    ks_ellis_assignments: str,
    mock_gerrydb_graph_file,
):
    document_id = ks_ellis_assignments

    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["vtd:20051120060", 1],
                ["vtd:20051000280", 1],
                ["vtd:20051000050", 1],
                ["vtd:20051000040", 1],
                ["vtd:20051900090", 2],
                ["vtd:20051900010", 2],
                ["vtd:20051120070", 2],
                ["vtd:20051120050", 2],
                ["vtd:20051120040", 2],
                ["vtd:20051000310", 2],
                ["vtd:20051000300", 2],
                ["vtd:20051000290", 2],
                ["vtd:2005100010A", 2],
                ["vtd:20051000090", 2],
                ["vtd:20051000080", 2],
                ["vtd:20051000030", 2],
                ["vtd:20051900100", 2],
                ["vtd:20051900070", 3],
                ["vtd:20051900060", 3],
                ["vtd:20051900050", 3],
                ["vtd:20051000240", 3],
                ["vtd:20051000230", 3],
                ["vtd:20051000220", 3],
                ["vtd:2005100021A", 3],
                ["vtd:20051000200", 3],
                ["vtd:2005100003A", 3],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1, "3": 1}


@fixture(name="ks_ellis_parent_only_document_id")
def ks_ellis_parent_only_document_id(
    client,
    session: Session,
    ks_ellis_parent_layer_only_districtr_map,
):
    response = client.post(
        "/api/create_document",
        json={"districtr_map_slug": "ks_ellis_county_block"},
    )
    assert response.status_code == 201, response.json()
    doc = response.json()

    return doc["document_id"]


@fixture
def ks_ellis_parent_only_assignments(
    client: TestClient, ks_ellis_parent_only_document_id: str
) -> str:
    document_id = ks_ellis_parent_only_document_id
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["200510730003052", 1],
                ["200510726002341", 1],
                ["200510730003101", 1],
                ["200510727011018", 1],
                ["200510728021088", 2],
                ["200510730002103", 2],
                ["200510730003026", 2],
                ["200510726002312", 2],
                ["200510726001064", 2],
                ["200510730001263", 2],
                ["200510726002362", 2],
                ["200510730001013", 2],
                ["200510730001224", 2],
                ["200510726002422", 2],
                ["200510728014082", 2],
                ["200510730001184", 2],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200, response.json()

    return document_id


def test_ks_ellis_parent_only_geos_contiguity(
    client: TestClient, ks_ellis_parent_only_assignments: str, mock_gerrydb_graph_file
):
    document_id = ks_ellis_parent_only_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200, response.json()
    assert response.json() == {"1": 4, "2": 12}


def test_ks_ellis_parent_only_geos_zone_connected_components(
    client: TestClient, ks_ellis_parent_only_assignments: str, mock_gerrydb_graph_file
):
    document_id = ks_ellis_parent_only_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity/1/connected_component_bboxes",
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert len(data["features"]) == 4


def test_ks_ellis_parent_only_geos_zone_connected_components_missing_zone(
    client: TestClient, ks_ellis_parent_only_assignments: str, mock_gerrydb_graph_file
):
    document_id = ks_ellis_parent_only_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity/3/connected_component_bboxes",
    )
    assert response.status_code == 404, response.json()
    data = response.json()
    assert data["detail"] == "Zone not found"


# ── /unassigned: grouping on the hybrid dual graph ────────────────────────────
# These exercise get_unassigned_geoids, which after PR #541 groups unassigned
# units directly on the combined parent+block graph (no resolving children up
# to parents). simple_geos topology is in the comment near the top of this file;
# the three parents are mutually adjacent and block ...006 borders parent ...001.


def test_unassigned_all_parents_group_by_adjacency(
    client: TestClient, document_id: str, mock_gerrydb_graph_file
):
    """Nothing assigned -> every parent is unassigned, and the three mutually
    adjacent simple_geos parents collapse into a single component."""
    response = client.get(f"/api/document/{document_id}/unassigned")
    assert response.status_code == 200, response.json()
    components = response.json()["components"]
    assert len(components) == 1
    assert sorted(components[0]) == [
        "vtd:000010000001",
        "vtd:000010000002",
        "vtd:000010000003",
    ]


def test_unassigned_groups_parent_and_block_across_levels(
    client: TestClient, document_id: str, mock_gerrydb_graph_file
):
    """Cross-level grouping: an unassigned parent (vtd:...001) and an unassigned
    block in a different parent (block ...006, child of vtd:...003) are joined
    via the hybrid graph's cross-level edge — no child->parent resolution."""
    client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["vtd:000010000002", 1],
                ["vtd:000010000003", 1],
                ["000010000000006", None],  # block child of vtd:...003, unassigned
                ["vtd:000010000001", None],  # parent unit, unassigned
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    response = client.get(f"/api/document/{document_id}/unassigned")
    assert response.status_code == 200, response.json()
    components = response.json()["components"]
    assert len(components) == 1
    assert sorted(components[0]) == ["000010000000006", "vtd:000010000001"]


def test_unassigned_falls_back_to_singletons_without_graph(
    client: TestClient, document_id: str, monkeypatch
):
    """When the hybrid graph can't be loaded, each unassigned id is returned as
    its own singleton so gaps stay visible."""
    import fastapi
    import app.main as main_module

    def _raise(_name: str):
        raise fastapi.HTTPException(status_code=404, detail="Graph unavailable")

    monkeypatch.setattr(main_module, "get_graph", _raise)
    response = client.get(f"/api/document/{document_id}/unassigned")
    assert response.status_code == 200, response.json()
    components = response.json()["components"]
    assert sorted(len(c) for c in components) == [1, 1, 1]
    assert sorted(c[0] for c in components) == [
        "vtd:000010000001",
        "vtd:000010000002",
        "vtd:000010000003",
    ]
