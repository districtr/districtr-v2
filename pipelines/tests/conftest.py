"""Shared fixtures for pipeline tests.

All synthetic gpkg files are created from in-memory geometries using shapely/geopandas
so tests run without any external data files or S3 access.

Grid topology used by most fixtures (each cell is a child block, columns are parents):

    VTD_A    VTD_B    VTD_C
  +-------+-------+-------+
  |block_01|block_11|block_21|  y: 1–2
  +-------+-------+-------+
  |block_00|block_10|block_20|  y: 0–1
  +-------+-------+-------+
     x:0–1    x:1–2    x:2–3

Adjacent block edges:
  block_00–block_10, block_10–block_20   (horizontal, bottom row)
  block_01–block_11, block_11–block_21   (horizontal, top row)
  block_00–block_01, block_10–block_11, block_20–block_21  (vertical)
"""

import sqlite3
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import box

CHILD_EDGES = [
    ("block_00", "block_10"),
    ("block_10", "block_20"),
    ("block_00", "block_01"),
    ("block_10", "block_11"),
    ("block_20", "block_21"),
    ("block_01", "block_11"),
    ("block_11", "block_21"),
]


def _write_edge_table(gpkg_path: Path, edges: list[tuple[str, str]]) -> None:
    conn = sqlite3.connect(gpkg_path)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS gerrydb_graph_edge (path_1 TEXT, path_2 TEXT)"
    )
    conn.executemany("INSERT INTO gerrydb_graph_edge VALUES (?, ?)", edges)
    conn.commit()
    conn.close()


def _write_child_gpkg(path: Path, layer: str, edges: list[tuple[str, str]]) -> None:
    children = gpd.GeoDataFrame(
        {
            "path": [
                "block_00",
                "block_10",
                "block_20",
                "block_01",
                "block_11",
                "block_21",
            ],
            "geometry": [
                box(0, 0, 1, 1),
                box(1, 0, 2, 1),
                box(2, 0, 3, 1),
                box(0, 1, 1, 2),
                box(1, 1, 2, 2),
                box(2, 1, 3, 2),
            ],
        },
        crs="EPSG:4326",
    )
    children.to_file(path, layer=layer, driver="GPKG")
    _write_edge_table(path, edges)


def _write_parent_gpkg(
    path: Path, layer: str, parents: list[tuple[str, object]]
) -> None:
    names, geoms = zip(*parents)
    gdf = gpd.GeoDataFrame(
        {"path": list(names), "geometry": list(geoms)}, crs="EPSG:4326"
    )
    gdf.to_file(path, layer=layer, driver="GPKG")


@pytest.fixture
def normal_gpkgs(tmp_path: Path):
    """Standard 6-block / 3-VTD grid where every block centroid falls within its VTD."""
    child_path = tmp_path / "simple_child.gpkg"
    parent_path = tmp_path / "simple_parent.gpkg"

    _write_child_gpkg(child_path, "simple_child", CHILD_EDGES)
    _write_parent_gpkg(
        parent_path,
        "simple_parent",
        [
            ("vtd_A", box(0, 0, 1, 2)),
            ("vtd_B", box(1, 0, 2, 2)),
            ("vtd_C", box(2, 0, 3, 2)),
        ],
    )
    return child_path, parent_path


@pytest.fixture
def mismatch_gpkgs(tmp_path: Path):
    """Parent polygons slightly shrunk so block_00's centroid (0.5, 0.5) falls
    just outside VTD_A (which only extends to x=0.4). block_00 is left without
    a parent annotation, causing _build_combined_graph to raise ValueError."""
    child_path = tmp_path / "mismatch_child.gpkg"
    parent_path = tmp_path / "mismatch_parent.gpkg"

    _write_child_gpkg(child_path, "mismatch_child", CHILD_EDGES)
    _write_parent_gpkg(
        parent_path,
        "mismatch_parent",
        [
            (
                "vtd_A",
                box(0, 0, 0.4, 2),
            ),  # shrunk: block_00 centroid (0.5,0.5) is outside
            ("vtd_B", box(1, 0, 2, 2)),
            ("vtd_C", box(2, 0, 3, 2)),
        ],
    )
    return child_path, parent_path


@pytest.fixture
def non_contiguous_gpkgs(tmp_path: Path):
    """VTD_A owns block_00 (bottom-left) and block_21 (top-right) — two blocks
    that are not adjacent in the graph, making VTD_A a non-contiguous parent."""
    child_path = tmp_path / "nc_child.gpkg"
    parent_path = tmp_path / "nc_parent.gpkg"

    _write_child_gpkg(child_path, "nc_child", CHILD_EDGES)
    # VTD_A: two disconnected regions covering block_00 and block_21
    from shapely.ops import unary_union

    vtd_a_geom = unary_union([box(0, 0, 1, 1), box(2, 1, 3, 2)])
    _write_parent_gpkg(
        parent_path,
        "nc_parent",
        [
            ("vtd_A", vtd_a_geom),
            ("vtd_B", box(1, 0, 2, 2)),
            ("vtd_C", box(0, 1, 1, 2).union(box(2, 0, 3, 1))),
        ],
    )
    return child_path, parent_path


@pytest.fixture
def no_edge_table_gpkg(tmp_path: Path):
    """A GeoPackage with a geometry layer but no gerrydb_graph_edge table."""
    gpkg = tmp_path / "no_edges.gpkg"
    gdf = gpd.GeoDataFrame(
        {"path": ["x"], "geometry": [box(0, 0, 1, 1)]}, crs="EPSG:4326"
    )
    gdf.to_file(gpkg, layer="no_edges", driver="GPKG")
    return gpkg


@pytest.fixture
def orphaned_node_gpkgs(tmp_path: Path):
    """Edge list includes 'block_ghost' which has no geometry in the child layer.
    After annotation, block_ghost has no 'parent' attribute."""
    child_path = tmp_path / "orphan_child.gpkg"
    parent_path = tmp_path / "orphan_parent.gpkg"

    edges_with_ghost = CHILD_EDGES + [("block_00", "block_ghost")]
    _write_child_gpkg(child_path, "orphan_child", edges_with_ghost)
    _write_parent_gpkg(
        parent_path,
        "orphan_parent",
        [
            ("vtd_A", box(0, 0, 1, 2)),
            ("vtd_B", box(1, 0, 2, 2)),
            ("vtd_C", box(2, 0, 3, 2)),
        ],
    )
    return child_path, parent_path
