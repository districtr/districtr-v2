"""Score an ensemble's packed plans for compactness and county splits.

Scoring uses gerrytools' engine-backed ``PlanEvaluator`` (gerrytools.scoring), which
prepares VTD geometry once and then evaluates every plan with a compiled Rust engine.
Geometry is reprojected to EPSG:5070 (the equal-area projection the app's evaluation
panel uses, ``backend/app/evaluation/context.py``) before any area or perimeter is
measured.

Per-plan outputs:

- ``reock`` (plans x districts): district area / area of its minimum enclosing circle
  (``gerrytools.scoring.Reock``).
- ``polsby_popper`` (plans x districts): 4 * pi * area / perimeter^2
  (``gerrytools.scoring.PolsbyPopper``, geometry-backed).
- ``county_splits`` (plans): number of counties assigned to more than one district
  (``gerrytools.scoring.RegionSplits("county")``).
- ``county_pieces`` (plans): number of occupied (county, district) pairs
  (``gerrytools.scoring.RegionPieces("county")``) — a county entirely inside one
  district counts 1.

District columns are sorted by district id, matching the 0-based ids in the source
npz's ``assignments`` array.
"""

import importlib.metadata
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import networkx as nx
import numpy as np
from gerrytools.scoring import (
    PlanEvaluator,
    PolsbyPopper,
    Reock,
    RegionPieces,
    RegionSplits,
)

from ensembles.graph import COUNTY_COL, county_of
from transforms.graph import _gpkg_layer_name

logger = logging.getLogger(__name__)

TARGET_CRS = "EPSG:5070"

DEFINITIONS = {
    "reock": (
        "gerrytools.scoring.Reock: district area divided by the area of its minimum "
        "enclosing circle, from EPSG:5070 geometry."
    ),
    "polsby_popper": (
        "gerrytools.scoring.PolsbyPopper: 4 * pi * area / perimeter^2, from EPSG:5070 "
        "geometry."
    ),
    "county_splits": (
        "gerrytools.scoring.RegionSplits('county'): number of counties assigned to "
        "more than one district."
    ),
    "county_pieces": (
        "gerrytools.scoring.RegionPieces('county'): number of occupied "
        "(county, district) pairs; a county entirely inside one district counts 1."
    ),
}


def load_geometry(vtd_gpkg: str | Path) -> gpd.GeoDataFrame:
    """VTD geometry indexed by path, with each VTD's county GEOID attached."""
    layer = _gpkg_layer_name(vtd_gpkg)
    gdf = gpd.read_file(vtd_gpkg, layer=layer)[["path", "geometry"]].set_index("path")
    gdf[COUNTY_COL] = [county_of(path) for path in gdf.index]
    return gdf


def score_ensemble(
    npz_path: str | Path, vtd_gpkg: str | Path, n_plans: int | None
) -> dict:
    """Score the first ``n_plans`` plans of a packed ensemble npz (``None`` for all).

    Returns the score arrays plus the facts the manifest records.
    """
    data = np.load(npz_path)
    node_ids = data["node_ids"]
    assignments = data["assignments"]
    if n_plans is not None:
        assignments = assignments[:n_plans]

    gdf = load_geometry(vtd_gpkg)
    missing = set(node_ids) - set(gdf.index)
    if missing:
        raise ValueError(f"{len(missing)} plan nodes are missing from {vtd_gpkg}")

    graph = nx.Graph()
    graph.add_nodes_from(node_ids)  # no edges: these metrics don't need adjacency
    evaluator = PlanEvaluator(graph, geometry=gdf, target_crs=TARGET_CRS)
    evaluator.add_metrics(
        Reock(), PolsbyPopper(), RegionSplits(COUNTY_COL), RegionPieces(COUNTY_COL)
    )

    start = time.monotonic()
    result = evaluator.evaluate_many(assignments)
    wall_time = time.monotonic() - start
    logger.info(
        "Scored %d plans in %.1fs (%.2f ms/plan)",
        len(assignments),
        wall_time,
        1000 * wall_time / len(assignments),
    )

    reock = result["reock"].sort_index(axis=1).to_numpy(dtype=np.float64)
    polsby_popper = (
        result["polsby_popper"].sort_index(axis=1).to_numpy(dtype=np.float64)
    )
    return {
        "reock": reock,
        "polsby_popper": polsby_popper,
        "county_splits": result["region_splits"].to_numpy(dtype=np.int64),
        "county_pieces": result["region_pieces"].to_numpy(dtype=np.int64),
        "n_plans": int(len(assignments)),
        "wall_time_seconds": wall_time,
    }


def write_npz(out_path: str | Path, facts: dict) -> None:
    np.savez_compressed(
        out_path,
        reock=facts["reock"],
        polsby_popper=facts["polsby_popper"],
        county_splits=facts["county_splits"],
        county_pieces=facts["county_pieces"],
        n_plans=facts["n_plans"],
    )


def write_manifest(
    path: str | Path, source_npz: str | Path, vtd_gpkg: str | Path, facts: dict
) -> None:
    manifest = {
        "source_npz": str(source_npz),
        "vtd_gpkg": str(vtd_gpkg),
        "n_plans": facts["n_plans"],
        "gerrytools_version": importlib.metadata.version("gerrytools"),
        "crs": TARGET_CRS,
        "definitions": DEFINITIONS,
        "wall_time_seconds": facts["wall_time_seconds"],
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    Path(path).write_text(json.dumps(manifest, indent=1))
