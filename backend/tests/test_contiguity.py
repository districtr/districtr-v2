from fastapi.testclient import TestClient
from pytest import fixture
from networkx import Graph, write_gml, read_gml
from app.main import contiguity
from app.contiguity.main import (
    check_subgraph_contiguity,
    get_gerrydb_block_graph,
    get_block_assignments,
    graph_from_gpkg,
    write_graph_to_gml,
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
    """
    Parents     Children
    A – B       a – e – f
    |   |       |   |   |
    C ––        c – b ––
                |   |
                d ––

    where
    - A = { a, e }
    - B = { b, c, d}
    - C = { f }
    """
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
                {"document_id": document_id, "geo_id": "B", "zone": 2},
                {"document_id": document_id, "geo_id": "C", "zone": 1},
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


def test_graph_from_gpkg():
    G = graph_from_gpkg(FIXTURES_PATH / "ri_vtd_p4_view.gpkg")
    assert len(G.edges) == 1154
    assert len(G.nodes) == 422


@fixture(name="ri_vtd_p4_view_graph")
def ri_vtd_p4_view_graph_fixture() -> Graph:
    return graph_from_gpkg(FIXTURES_PATH / "ri_vtd_p4_view.gpkg")


def test_write_graph_to_gml(ri_vtd_p4_view_graph: Graph):
    with NamedTemporaryFile() as f:
        gml_path = write_graph_to_gml(
            G=ri_vtd_p4_view_graph, gerrydb_name="ri_vtd_p4_view", out_path=f.name
        )
        print(gml_path)
        G = read_gml(gml_path)
        assert len(G.edges) == 1154
        assert len(G.nodes) == 422
        assert G.edges == ri_vtd_p4_view_graph.edges
        assert G.nodes == ri_vtd_p4_view_graph.nodes


@fixture
def mock_gerrydb_graph_file(monkeypatch):
    def mock_get_file(gerrydb_name: str) -> str:
        return f"{FIXTURES_PATH}/{gerrydb_name}.gml.gz"

    monkeypatch.setattr(contiguity, "get_gerrydb_graph_file", mock_get_file)


def test_simple_geos_contiguity(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": True, "2": True}


def test_simple_geos_discontiguity(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": True, "2": True}

    # Break one parent and create discontiguous assignments
    # See `simple_geos_graph` fixture for graph diagram and
    # `simple_contigous_assignments` fixture for existing assignments
    response = client.patch(
        f"/api/update_assignments/{document_id}/shatter_parents", json={"geoids": ["A"]}
    )
    assert response.status_code == 200
    response = client.patch(
        "/api/update_assignments",
        json={"assignments": [{"document_id": document_id, "geo_id": "e", "zone": 2}]},
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": False, "2": True}
