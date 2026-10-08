"""Add block-level columns from a CSV to a block GeoPackage and its parent GeoPackage.

Block values are joined on the block path; parent values are the sums of each
parent's blocks, with block-to-parent membership read from the map's graph. Both
GeoPackages are copied and edited in place at the SQL level, so every other
layer, column and geometry stays byte-identical.
"""

import logging
import shutil
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

import geopandas as gpd
import numpy as np
import pandas as pd

from core.io import download_file_from_s3
from core.settings import settings
from transforms.graph import GRAPH_NPZ_FORMAT_VERSION

LOGGER = logging.getLogger(__name__)

# GeoPackage rtree triggers reference SpatiaLite functions. The triggers that
# call them fire only when geometry or fid changes, which this module never
# does, but SQLite still has to resolve the names when compiling an UPDATE.
_GPKG_TRIGGER_FUNCTIONS = {
    "ST_IsEmpty": 1,
    "ST_MinX": 1,
    "ST_MaxX": 1,
    "ST_MinY": 1,
    "ST_MaxY": 1,
}


def _resolve_local(gpkg: str) -> Path:
    url = urlparse(gpkg)
    if url.scheme == "s3":  # pragma: no cover
        return Path(download_file_from_s3(settings.get_s3_client(), url))
    return Path(gpkg)


def _layer_name(gpkg: str) -> str:
    return Path(urlparse(gpkg).path).stem


def _parent_map(graph: str) -> pd.Series:
    """Block path -> parent path from a graph npz, for every node that has a parent."""
    with np.load(_resolve_local(graph), allow_pickle=False) as z:
        version = int(z["format_version"])
        if version != GRAPH_NPZ_FORMAT_VERSION:
            raise ValueError(f"Unsupported graph npz format_version {version}")
        node_ids, parent_of = z["node_ids"], z["parent_of"]
    has_parent = parent_of >= 0
    return pd.Series(
        node_ids[parent_of[has_parent]],
        index=pd.Index(node_ids[has_parent], name="path"),
        name="parent_path",
    )


def _write_columns(gpkg: Path, layer: str, values: pd.DataFrame) -> None:
    columns = [c for c in values.columns if c != "path"]
    conn = sqlite3.connect(gpkg)
    try:
        for name, n_args in _GPKG_TRIGGER_FUNCTIONS.items():
            conn.create_function(name, n_args, lambda *_: None)
        existing = {row[1] for row in conn.execute(f'PRAGMA table_info("{layer}")')}
        clash = [c for c in columns if c in existing]
        if clash:
            raise ValueError(f"{layer} already has columns {clash}")
        with conn:
            for c in columns:
                conn.execute(f'ALTER TABLE "{layer}" ADD COLUMN "{c}" REAL')
            conn.execute(
                "CREATE TEMP TABLE new_values (path TEXT PRIMARY KEY, "
                + ", ".join(f'"{c}" REAL' for c in columns)
                + ")"
            )
            conn.executemany(
                f"INSERT INTO new_values VALUES ({', '.join('?' * (len(columns) + 1))})",
                values[["path", *columns]].itertuples(index=False, name=None),
            )
            conn.execute(
                f'UPDATE "{layer}" SET '
                + ", ".join(f'"{c}" = new_values."{c}"' for c in columns)
                + f' FROM new_values WHERE "{layer}".path = new_values.path'
            )
    finally:
        conn.close()


def add_block_columns(
    blocks_gpkg: str,
    parent_gpkg: str,
    csv_path: str,
    graph: str,
    columns: list[str],
    id_column: str = "geoid20",
    out_dir: Path | None = None,
) -> tuple[Path, Path]:
    """Write copies of both GeoPackages with the CSV's columns added.

    `graph` is the map's graph npz (local path or s3 URI), the source of which
    parent each block belongs to. Refuses to write anything if the CSV and the
    block layer don't cover exactly the same blocks, if a named column has a
    blank cell, if a block has no parent in the graph, or if a parent named by
    the graph is missing from the parent layer.

    Returns the paths of the new block and parent GeoPackages.
    """
    out_dir = Path(out_dir or settings.OUT_SCRATCH)
    blocks_layer, parent_layer = _layer_name(blocks_gpkg), _layer_name(parent_gpkg)
    blocks_src, parent_src = _resolve_local(blocks_gpkg), _resolve_local(parent_gpkg)

    csv = pd.read_csv(csv_path, dtype={id_column: str}).rename(
        columns={id_column: "path"}
    )
    csv = csv[["path", *columns]]

    blocks = gpd.read_file(blocks_src, layer=blocks_layer, ignore_geometry=True)
    parents = gpd.read_file(parent_src, layer=parent_layer, ignore_geometry=True)

    csv_ids, block_ids = set(csv["path"]), set(blocks["path"])
    if csv_ids != block_ids or csv["path"].duplicated().any():
        raise ValueError(
            f"CSV and {blocks_layer} disagree: {len(csv_ids - block_ids)} CSV ids "
            f"not in the layer, {len(block_ids - csv_ids)} layer blocks not in the "
            f"CSV, {int(csv['path'].duplicated().sum())} duplicate CSV ids"
        )
    blank = csv[columns].isna().sum()
    if blank.any():
        raise ValueError(f"CSV has blank cells: {blank[blank > 0].to_dict()}")

    mapping = _parent_map(graph).reindex(csv["path"])
    if mapping.isna().any():
        raise ValueError(
            f"{int(mapping.isna().sum())} blocks have no parent in {graph}"
        )
    unknown = set(mapping) - set(parents["path"])
    if unknown:
        raise ValueError(
            f"{len(unknown)} parents in {graph} are missing from {parent_layer}"
        )
    parent_values = (
        csv.assign(parent_path=mapping.to_numpy())
        .groupby("parent_path")[columns]
        .sum()
        .reindex(parents["path"], fill_value=0)
        .rename_axis("path")
        .reset_index()
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    blocks_out, parent_out = out_dir / blocks_src.name, out_dir / parent_src.name
    shutil.copyfile(blocks_src, blocks_out)
    shutil.copyfile(parent_src, parent_out)
    _write_columns(blocks_out, blocks_layer, csv)
    _write_columns(parent_out, parent_layer, parent_values)
    LOGGER.info(
        "Added %s to %s (%d blocks) and %s (%d parents)",
        columns,
        blocks_out,
        len(csv),
        parent_out,
        len(parent_values),
    )
    return blocks_out, parent_out
