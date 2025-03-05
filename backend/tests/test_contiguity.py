from fastapi.testclient import TestClient
from pytest import fixture
from networkx import Graph, write_gml, read_gml
from app.main import contiguity
from app.contiguity.main import (
    check_subgraph_contiguity,
    subgraph_number_connected_components,
    get_gerrydb_block_graph,
    get_block_assignments,
    graph_from_gpkg,
    write_graph,
    GraphFileFormat,
)
from app.utils import create_parent_child_edges
from tempfile import NamedTemporaryFile
from tests.constants import FIXTURES_PATH
from sqlmodel import Session
import sqlalchemy as sa


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
    assert subgraph_number_connected_components(connected_graph, ["a", "b", "c", "d"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "b", "c"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "b", "d"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "b"]) == 1 
    assert subgraph_number_connected_components(connected_graph, ["a"]) == 1
    assert subgraph_number_connected_components(connected_graph, ["a", "c"]) == 2


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
    G = get_gerrydb_block_graph(file_path, graph_file_format=GraphFileFormat.gml)

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
    A – C       a – e – f
    |   |       |   |   |
    B ––        c – b ––
                |   |
                d ––

    where
    - A = { a, e }
    - B = { b, c, d}
    - C = { f }
    """
    return get_gerrydb_block_graph(file_path, graph_file_format=GraphFileFormat.gml)


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
    districtr_map_uuid = session.execute(
        sa.text("""
        SELECT districtrmap.uuid
            FROM document.document
            LEFT JOIN districtrmap
            ON document.gerrydb_table = districtrmap.gerrydb_table_name
            WHERE document.document_id = :document_id;
        """),
        {"document_id": document_id},
    ).scalar()
    assert districtr_map_uuid is not None
    zone_block_nodes = get_block_assignments(session, document_id, districtr_map_uuid)

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
        gml_path = write_graph(
            G=ri_vtd_p4_view_graph,
            gerrydb_name="ri_vtd_p4_view",
            out_path=f.name,
            graph_file_format=GraphFileFormat.gml,
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
        return f"{FIXTURES_PATH}/{gerrydb_name}.pkl"

    monkeypatch.setattr(contiguity, "get_gerrydb_graph_file", mock_get_file)


def test_simple_geos_contiguity(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1}


def test_simple_geos_discontiguity(
    client: TestClient, simple_contiguous_assignments: str, mock_gerrydb_graph_file
):
    document_id = simple_contiguous_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1}

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
    assert response.json() == {"1": 2, "2": 1}


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
        json={
            "gerrydb_table": "ks_ellis_geos",
        },
    )
    assert response.status_code == 201
    doc = response.json()

    return doc["document_id"]


@fixture
def ks_ellis_assignments(client: TestClient, ks_ellis_document_id: str) -> str:
    document_id = ks_ellis_document_id
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "vtd:20051120060", "zone": 1},
                {"document_id": document_id, "geo_id": "vtd:20051000280", "zone": 1},
                {"document_id": document_id, "geo_id": "vtd:20051000050", "zone": 1},
                {"document_id": document_id, "geo_id": "vtd:20051000040", "zone": 1},
                {"document_id": document_id, "geo_id": "vtd:20051900090", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051900010", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051120070", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051120050", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051120040", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051000310", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051000300", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051000290", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:2005100010A", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051000090", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051000080", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051000030", "zone": 2},
                {"document_id": document_id, "geo_id": "vtd:20051900100", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051900070", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051900060", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051900050", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051000240", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051000230", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051000220", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:2005100021A", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:20051000200", "zone": 3},
                {"document_id": document_id, "geo_id": "vtd:2005100003A", "zone": 3},
            ],
            "updated_at": "2023-10-01T00:00:00Z",
        },
    )
    assert response.status_code == 200

    return document_id


def test_ks_ellis_geos_contiguity(
    client: TestClient, ks_ellis_assignments: str, mock_gerrydb_graph_file
):
    document_id = ks_ellis_assignments
    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1, "3": 2}


def test_fix_ks_ellis_geos_contiguity(
    client: TestClient, ks_ellis_assignments: str, mock_gerrydb_graph_file
):
    document_id = ks_ellis_assignments

    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "vtd:20051900100", "zone": 2},
            ],
            "updated_at": "2023-10-01T00:00:00Z",
        },
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/document/{document_id}/contiguity",
    )
    assert response.status_code == 200
    assert response.json() == {"1": 1, "2": 1, "3": 1}
