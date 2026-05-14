"""Tests for app.evaluation.context."""

from networkx import Graph, read_gml
from pytest import fixture
from tempfile import NamedTemporaryFile
from tests.constants import FIXTURES_PATH
from app.evaluation.graph import (
    get_gerrydb_block_graph,
    graph_from_gpkg,
    write_graph,
    GraphFileFormat,
)


@fixture(name="simple_geos_gml_path")
def gerrydb_simple_child_geos_graph_path() -> str:
    return str(FIXTURES_PATH / "contiguity" / "simple_child_geos.gml")


def test_get_gerrydb_block_graph(simple_geos_gml_path: str):
    G = get_gerrydb_block_graph(simple_geos_gml_path, graph_file_format=GraphFileFormat.gml)

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


def test_graph_from_gpkg():
    G = graph_from_gpkg(FIXTURES_PATH / "gerrydb" / "ks_ellis_county_block.gpkg")
    assert len(G.edges) == 5439
    assert len(G.nodes) == 2296


@fixture(name="gpkg_block_graph")
def ks_ellis_gpkg_graph_fixture() -> Graph:
    return graph_from_gpkg(FIXTURES_PATH / "gerrydb" / "ks_ellis_county_block.gpkg")


def test_write_graph_to_gml(gpkg_block_graph: Graph):
    with NamedTemporaryFile() as f:
        gml_path = write_graph(
            G=gpkg_block_graph,
            gerrydb_name="gpkg_block_graph",
            out_path=f.name,
            graph_file_format=GraphFileFormat.gml,
        )
        G = read_gml(gml_path)
        assert len(G.edges) == 5439
        assert len(G.nodes) == 2296
        assert G.edges == gpkg_block_graph.edges
        assert G.nodes == gpkg_block_graph.nodes
