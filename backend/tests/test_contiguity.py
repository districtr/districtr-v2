from fastapi.testclient import TestClient
from pytest import fixture
from networkx import Graph, write_gml, read_gml
from app.contiguity.main import (
    check_subgraph_contiguity,
    get_gerrydb_block_graph,
    get_block_assignments,
)
from app.utils import create_parent_child_edges
from tempfile import NamedTemporaryFile
from tests.constants import FIXTURES_PATH
from sqlmodel import Session


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


def test_load_gml(connected_graph):
    with NamedTemporaryFile() as f:
        write_gml(connected_graph, f.name)

        with open(f.name, "rb") as f:
            G = read_gml(f)
            print(G.nodes)
            print(G.edges)
            test_check_subgraph_contiguity(G)


@fixture(name="file_path")
def gerrydb_simple_child_geos_graph_path() -> str:
    return str(FIXTURES_PATH / "simple_child_geos.gml")


def test_get_gerrydb_block_graph(file_path: str):
    G = get_gerrydb_block_graph(file_path)

    assert set(G.nodes()) == {"a", "b", "c", "d", "e", "f"}
    assert list(G.edges()) == [
        ("a", "e"),
        ("a", "c"),
        ("e", "f"),
        ("e", "b"),
        ("f", "b"),
        ("c", "d"),
        ("c", "b"),
        ("d", "b"),
    ]


@fixture
def simple_geos_graph(file_path: str) -> Graph:
    return get_gerrydb_block_graph(file_path)


# Idem in test_utils.py
@fixture(name="document_id")
def document_id_fixture(
    client, session: Session, simple_shatterable_districtr_map, gerrydb_simple_geos_view
):
    create_parent_child_edges(
        session=session, districtr_map_uuid=simple_shatterable_districtr_map
    )
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": "simple_geos",
        },
    )
    assert response.status_code == 201
    doc = response.json()

    return doc["document_id"]


@fixture(name="simple_contiguous_assignments")
def simple_contigous_assignments(client: TestClient, document_id: str) -> str:
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "A", "zone": 1},
                {"document_id": document_id, "geo_id": "B", "zone": 1},
                {"document_id": document_id, "geo_id": "C", "zone": 2},
            ],
            "updated_at": "2023-10-01T00:00:00Z",
        },
    )
    assert response.status_code == 200

    return document_id


def test_all_zones_contiguous(
    session: Session, simple_geos_graph: Graph, simple_contiguous_assignments: str
):
    document_id = simple_contiguous_assignments
    zone_block_nodes = get_block_assignments(session, document_id)

    for zone in zone_block_nodes:
        assert check_subgraph_contiguity(simple_geos_graph, zone.nodes)
