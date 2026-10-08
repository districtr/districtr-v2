"""Tests for pipelines/transforms/block_columns.py."""

import sqlite3
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from networkx import Graph
from shapely.geometry import box

from transforms.block_columns import add_block_columns
from transforms.graph import graph_to_npz_arrays

BLOCKS = ["block_00", "block_10", "block_20", "block_01", "block_11", "block_21"]
BLOCK_POP = [10.0, 20.0, 30.0, 1.0, 2.0, 3.0]
COLUMNS = ["pres_24_dem", "pres_24_rep"]
PARENT_OF = {
    "block_00": "vtd_A",
    "block_01": "vtd_A",
    "block_10": "vtd_B",
    "block_11": "vtd_B",
    "block_20": "vtd_C",
    "block_21": "vtd_C",
}


def _write_graph(path: Path, parent_of: dict[str, str]) -> Path:
    G = Graph()
    G.add_nodes_from(set(parent_of.values()))
    for block, parent in parent_of.items():
        G.add_node(block, parent=parent)
    np.savez_compressed(path, **graph_to_npz_arrays(G))
    return path


def _write_gpkgs(tmp_path: Path):
    blocks_path = tmp_path / "st_block_view.gpkg"
    parent_path = tmp_path / "st_vtd_view.gpkg"
    geoms = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(2, 0, 3, 1)]
    geoms += [box(0, 1, 1, 2), box(1, 1, 2, 2), box(2, 1, 3, 2)]
    gpd.GeoDataFrame(
        {"path": BLOCKS, "total_pop": BLOCK_POP, "geometry": geoms}, crs="EPSG:4326"
    ).to_file(blocks_path, layer="st_block_view", driver="GPKG")
    conn = sqlite3.connect(blocks_path)
    conn.execute("CREATE TABLE gerrydb_graph_edge (path_1 TEXT, path_2 TEXT)")
    conn.execute("INSERT INTO gerrydb_graph_edge VALUES ('block_00', 'block_10')")
    conn.commit()
    conn.close()
    gpd.GeoDataFrame(
        {
            "path": ["vtd_A", "vtd_B", "vtd_C"],
            "total_pop": [11.0, 22.0, 33.0],
            "geometry": [box(0, 0, 1, 2), box(1, 0, 2, 2), box(2, 0, 3, 2)],
        },
        crs="EPSG:4326",
    ).to_file(parent_path, layer="st_vtd_view", driver="GPKG")
    graph_path = _write_graph(tmp_path / "st_view.npz", PARENT_OF)
    return blocks_path, parent_path, graph_path


def _write_csv(tmp_path: Path, blocks=BLOCKS) -> Path:
    csv_path = tmp_path / "votes.csv"
    pd.DataFrame(
        {
            "geoid20": blocks,
            "pres_24_dem": range(1, len(blocks) + 1),
            "pres_24_rep": [100] * len(blocks),
        }
    ).to_csv(csv_path, index=False)
    return csv_path


def _run(blocks_path, parent_path, csv_path, graph_path, out_dir, **kwargs):
    return add_block_columns(
        str(blocks_path),
        str(parent_path),
        str(csv_path),
        graph=str(graph_path),
        columns=COLUMNS,
        out_dir=out_dir,
        **kwargs,
    )


def test_adds_block_values_and_parent_sums(tmp_path):
    blocks_path, parent_path, graph_path = _write_gpkgs(tmp_path)
    blocks_out, parent_out = _run(
        blocks_path, parent_path, _write_csv(tmp_path), graph_path, tmp_path / "out"
    )

    blocks = gpd.read_file(blocks_out, layer="st_block_view").set_index("path")
    assert blocks.loc[BLOCKS, "pres_24_dem"].tolist() == [1, 2, 3, 4, 5, 6]
    assert blocks.loc[BLOCKS, "total_pop"].tolist() == BLOCK_POP

    parents = gpd.read_file(parent_out, layer="st_vtd_view").set_index("path")
    expected = {"vtd_A": 1 + 4, "vtd_B": 2 + 5, "vtd_C": 3 + 6}
    assert parents["pres_24_dem"].to_dict() == expected
    assert parents["pres_24_rep"].tolist() == [200, 200, 200]
    assert parents["total_pop"].tolist() == [11.0, 22.0, 33.0]


def test_parents_follow_the_graph(tmp_path):
    blocks_path, parent_path, _ = _write_gpkgs(tmp_path)
    moved = {**PARENT_OF, "block_01": "vtd_B"}
    graph_path = _write_graph(tmp_path / "moved.npz", moved)
    _, parent_out = _run(
        blocks_path, parent_path, _write_csv(tmp_path), graph_path, tmp_path / "out"
    )
    parents = gpd.read_file(parent_out, layer="st_vtd_view").set_index("path")
    assert parents["pres_24_dem"].to_dict() == {
        "vtd_A": 1,
        "vtd_B": 2 + 4 + 5,
        "vtd_C": 3 + 6,
    }


def test_other_layers_survive_and_inputs_untouched(tmp_path):
    blocks_path, parent_path, graph_path = _write_gpkgs(tmp_path)
    before = blocks_path.read_bytes()
    blocks_out, _ = _run(
        blocks_path, parent_path, _write_csv(tmp_path), graph_path, tmp_path / "out"
    )
    assert blocks_path.read_bytes() == before
    conn = sqlite3.connect(blocks_out)
    assert conn.execute("SELECT * FROM gerrydb_graph_edge").fetchall() == [
        ("block_00", "block_10")
    ]
    conn.close()


def test_refuses_csv_that_does_not_cover_every_block(tmp_path):
    blocks_path, parent_path, graph_path = _write_gpkgs(tmp_path)
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="disagree"):
        _run(
            blocks_path,
            parent_path,
            _write_csv(tmp_path, blocks=BLOCKS[:-1]),
            graph_path,
            out,
        )
    assert not out.exists()


def test_refuses_blank_cell(tmp_path):
    blocks_path, parent_path, graph_path = _write_gpkgs(tmp_path)
    csv_path = _write_csv(tmp_path)
    df = pd.read_csv(csv_path)
    df.loc[df["geoid20"] == "block_01", "pres_24_dem"] = None
    df.to_csv(csv_path, index=False)
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="blank cells"):
        _run(blocks_path, parent_path, csv_path, graph_path, out)
    assert not out.exists()


def test_refuses_block_without_parent_in_graph(tmp_path):
    blocks_path, parent_path, _ = _write_gpkgs(tmp_path)
    partial = {b: p for b, p in PARENT_OF.items() if b != "block_21"}
    graph_path = _write_graph(tmp_path / "partial.npz", partial)
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="no parent"):
        _run(blocks_path, parent_path, _write_csv(tmp_path), graph_path, out)
    assert not out.exists()


def test_refuses_graph_parent_missing_from_parent_layer(tmp_path):
    blocks_path, parent_path, _ = _write_gpkgs(tmp_path)
    graph_path = _write_graph(
        tmp_path / "other.npz", {**PARENT_OF, "block_21": "vtd_Z"}
    )
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="missing from st_vtd_view"):
        _run(blocks_path, parent_path, _write_csv(tmp_path), graph_path, out)
    assert not out.exists()


def test_refuses_existing_column(tmp_path):
    blocks_path, parent_path, graph_path = _write_gpkgs(tmp_path)
    csv_path = _write_csv(tmp_path)
    first, first_parent = _run(
        blocks_path, parent_path, csv_path, graph_path, tmp_path / "a"
    )
    with pytest.raises(ValueError, match="already has columns"):
        _run(first, first_parent, csv_path, graph_path, tmp_path / "b")
