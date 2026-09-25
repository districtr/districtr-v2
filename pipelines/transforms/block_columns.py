"""Add block-level columns from a CSV to a block GeoPackage and its parent GeoPackage.

Block values are joined on the block path; parent values are the sums of each
parent's blocks, assigned by the block's representative point (the same rule
the graph pipeline uses). Both GeoPackages are copied and edited in place at the
SQL level, so every other layer, column and geometry stays byte-identical.
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


def _numeric_columns(df: pd.DataFrame) -> list[str]:
    return [
        c
        for c in df.columns
        if c not in ("path", "fid", "geometry") and pd.api.types.is_numeric_dtype(df[c])
    ]


def _block_to_parent(blocks: gpd.GeoDataFrame, parents: gpd.GeoDataFrame) -> pd.Series:
    if parents.crs != blocks.crs:
        parents = parents.to_crs(blocks.crs)
    points = blocks[["path"]].set_geometry(blocks.geometry.representative_point())
    joined = gpd.sjoin(
        points,
        parents[["path", "geometry"]].rename(columns={"path": "parent_path"}),
        how="left",
        predicate="within",
    )
    unmatched = int(joined["parent_path"].isna().sum())
    multi = int(joined["path"].duplicated().sum())
    if unmatched or multi:
        raise ValueError(
            f"{unmatched} blocks fall in no parent and {multi} in more than one; "
            "parent values would not be exact block sums"
        )
    return joined.set_index("path")["parent_path"]


def _check_parent_consistency(
    blocks: pd.DataFrame, parents: pd.DataFrame, mapping: pd.Series
) -> None:
    shared = [c for c in _numeric_columns(blocks) if c in parents.columns]
    sums = (
        blocks.assign(parent_path=blocks["path"].map(mapping))
        .groupby("parent_path")[shared]
        .sum()
    )
    existing = parents.set_index("path")[shared].reindex(sums.index)
    bad = [
        c
        for c in shared
        if not np.allclose(sums[c], existing[c].fillna(0), rtol=1e-9, atol=1e-6)
    ]
    if bad:
        raise ValueError(
            "Existing parent columns are not the sums of their blocks under this "
            f"block-to-parent assignment: {bad}"
        )


def _write_columns(gpkg: Path, layer: str, values: pd.DataFrame, replace: bool) -> None:
    columns = [c for c in values.columns if c != "path"]
    conn = sqlite3.connect(gpkg)
    try:
        for name, n_args in _GPKG_TRIGGER_FUNCTIONS.items():
            conn.create_function(name, n_args, lambda *_: None)
        existing = {row[1] for row in conn.execute(f'PRAGMA table_info("{layer}")')}
        clash = [c for c in columns if c in existing]
        if clash and not replace:
            raise ValueError(
                f"{layer} already has columns {clash}; pass replace to overwrite them"
            )
        with conn:
            for c in columns:
                if c not in existing:
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
    id_column: str = "geoid20",
    columns: list[str] | None = None,
    out_dir: Path | None = None,
    replace: bool = False,
) -> tuple[Path, Path]:
    """Write copies of both GeoPackages with the CSV's columns added.

    Refuses to write anything if the CSV and the block layer don't cover exactly
    the same blocks, if any block falls in zero or several parents, or if the
    parent layer's existing columns aren't reproduced as sums of its blocks.

    Returns the paths of the new block and parent GeoPackages.
    """
    out_dir = Path(out_dir or settings.OUT_SCRATCH)
    blocks_layer, parent_layer = _layer_name(blocks_gpkg), _layer_name(parent_gpkg)
    blocks_src, parent_src = _resolve_local(blocks_gpkg), _resolve_local(parent_gpkg)

    csv = pd.read_csv(csv_path, dtype={id_column: str}).rename(
        columns={id_column: "path"}
    )
    columns = columns or [c for c in csv.columns if c != "path"]
    csv = csv[["path", *columns]]

    blocks = gpd.read_file(blocks_src, layer=blocks_layer)
    parents = gpd.read_file(parent_src, layer=parent_layer)

    csv_ids, block_ids = set(csv["path"]), set(blocks["path"])
    if csv_ids != block_ids or csv["path"].duplicated().any():
        raise ValueError(
            f"CSV and {blocks_layer} disagree: {len(csv_ids - block_ids)} CSV ids "
            f"not in the layer, {len(block_ids - csv_ids)} layer blocks not in the "
            f"CSV, {int(csv['path'].duplicated().sum())} duplicate CSV ids"
        )

    mapping = _block_to_parent(blocks, parents)
    _check_parent_consistency(
        pd.DataFrame(blocks.drop(columns="geometry")),
        pd.DataFrame(parents.drop(columns="geometry")),
        mapping,
    )
    parent_values = (
        csv.assign(parent_path=csv["path"].map(mapping))
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
    _write_columns(blocks_out, blocks_layer, csv, replace)
    _write_columns(parent_out, parent_layer, parent_values, replace)
    LOGGER.info(
        "Added %s to %s (%d blocks) and %s (%d parents)",
        columns,
        blocks_out,
        len(csv),
        parent_out,
        len(parent_values),
    )
    return blocks_out, parent_out
