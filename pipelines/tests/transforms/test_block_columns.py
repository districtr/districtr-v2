"""Tests for pipelines/transforms/block_columns.py."""

import sqlite3
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from transforms.block_columns import add_block_columns

BLOCKS = ["block_00", "block_10", "block_20", "block_01", "block_11", "block_21"]
BLOCK_POP = [10.0, 20.0, 30.0, 1.0, 2.0, 3.0]
PARENT_OF = {
    "block_00": "vtd_A",
    "block_01": "vtd_A",
    "block_10": "vtd_B",
    "block_11": "vtd_B",
    "block_20": "vtd_C",
    "block_21": "vtd_C",
}


def _write_gpkgs(tmp_path: Path, parent_pop: list[float] | None = None):
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
            "total_pop": parent_pop or [11.0, 22.0, 33.0],
            "geometry": [box(0, 0, 1, 2), box(1, 0, 2, 2), box(2, 0, 3, 2)],
        },
        crs="EPSG:4326",
    ).to_file(parent_path, layer="st_vtd_view", driver="GPKG")
    return blocks_path, parent_path


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


def test_adds_block_values_and_parent_sums(tmp_path):
    blocks_path, parent_path = _write_gpkgs(tmp_path)
    out = tmp_path / "out"
    blocks_out, parent_out = add_block_columns(
        str(blocks_path), str(parent_path), str(_write_csv(tmp_path)), out_dir=out
    )

    blocks = gpd.read_file(blocks_out, layer="st_block_view").set_index("path")
    assert blocks.loc[BLOCKS, "pres_24_dem"].tolist() == [1, 2, 3, 4, 5, 6]
    assert blocks.loc[BLOCKS, "total_pop"].tolist() == BLOCK_POP

    parents = gpd.read_file(parent_out, layer="st_vtd_view").set_index("path")
    expected = {"vtd_A": 1 + 4, "vtd_B": 2 + 5, "vtd_C": 3 + 6}
    assert parents["pres_24_dem"].to_dict() == expected
    assert parents["pres_24_rep"].tolist() == [200, 200, 200]
    assert parents["total_pop"].tolist() == [11.0, 22.0, 33.0]


def test_other_layers_survive_and_inputs_untouched(tmp_path):
    blocks_path, parent_path = _write_gpkgs(tmp_path)
    before = blocks_path.read_bytes()
    blocks_out, _ = add_block_columns(
        str(blocks_path),
        str(parent_path),
        str(_write_csv(tmp_path)),
        out_dir=tmp_path / "out",
    )
    assert blocks_path.read_bytes() == before
    conn = sqlite3.connect(blocks_out)
    assert conn.execute("SELECT * FROM gerrydb_graph_edge").fetchall() == [
        ("block_00", "block_10")
    ]
    conn.close()


def test_refuses_csv_that_does_not_cover_every_block(tmp_path):
    blocks_path, parent_path = _write_gpkgs(tmp_path)
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="disagree"):
        add_block_columns(
            str(blocks_path),
            str(parent_path),
            str(_write_csv(tmp_path, blocks=BLOCKS[:-1])),
            out_dir=out,
        )
    assert not out.exists()


def test_refuses_existing_column_unless_replace(tmp_path):
    blocks_path, parent_path = _write_gpkgs(tmp_path)
    csv_path = _write_csv(tmp_path)
    first, first_parent = add_block_columns(
        str(blocks_path), str(parent_path), str(csv_path), out_dir=tmp_path / "a"
    )
    with pytest.raises(ValueError, match="already has columns"):
        add_block_columns(
            str(first), str(first_parent), str(csv_path), out_dir=tmp_path / "b"
        )
    add_block_columns(
        str(first),
        str(first_parent),
        str(csv_path),
        out_dir=tmp_path / "c",
        replace=True,
    )


def test_refuses_parent_layer_that_is_not_block_sums(tmp_path):
    blocks_path, parent_path = _write_gpkgs(tmp_path, parent_pop=[11.0, 22.0, 99.0])
    with pytest.raises(ValueError, match="not the sums of their blocks"):
        add_block_columns(
            str(blocks_path),
            str(parent_path),
            str(_write_csv(tmp_path)),
            out_dir=tmp_path / "out",
        )


def test_refuses_block_outside_every_parent(tmp_path):
    blocks_path, _ = _write_gpkgs(tmp_path)
    parent_path = tmp_path / "st_vtd_view.gpkg"
    gpd.GeoDataFrame(
        {
            "path": ["vtd_A", "vtd_B"],
            "total_pop": [11.0, 22.0],
            "geometry": [box(0, 0, 1, 2), box(1, 0, 2, 2)],
        },
        crs="EPSG:4326",
    ).to_file(parent_path, layer="st_vtd_view", driver="GPKG")
    with pytest.raises(ValueError, match="fall in no parent"):
        add_block_columns(
            str(blocks_path),
            str(parent_path),
            str(_write_csv(tmp_path)),
            out_dir=tmp_path / "out",
        )
