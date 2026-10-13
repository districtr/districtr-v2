"""Score every plan of a packed ensemble with gerrytools.

Scoring uses gerrytools' engine-backed ``PlanEvaluator`` (gerrytools.scoring), which
prepares VTD geometry and columns once and then evaluates every plan with a compiled
Rust engine. Geometry is reprojected to EPSG:5070 (the equal-area projection the app's
evaluation panel uses, ``backend/app/evaluation/context.py``) before any area or
perimeter is measured. Every metric is a gerrytools metric class; ``SERIES`` names the
class behind each stored array.

Stored arrays (``<preset>.scores.npz``), all with one row per plan:

- per election ``<e>`` (``<e>_dem`` / ``<e>_rep`` columns, Democratic point of view):
  ``<metric>__<e>`` for each metric in ``PER_ELECTION`` — plan scalars, except
  ``district_vote_shares__<e>`` (plans x districts, Democratic two-party share).
- across all elections: ``n_dem_districts``, ``n_rep_districts``,
  ``n_swing_districts``, ``n_competitive_contests``.
- ``county_splits``, ``county_pieces``.
- ``reock`` and ``polsby_popper`` (plans x districts), plus their plan-level
  ``<metric>_mean``, ``<metric>_min`` and ``<metric>_max`` across districts.
- ``elections`` (election keys) and ``n_plans``.

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
    CompetitiveContests,
    Disproportionality,
    DistrictVoteShares,
    EfficiencyGap,
    Eguia,
    MeanMedian,
    OppositionPartyDistricts,
    PartisanBias,
    PartyDistricts,
    PlanEvaluator,
    PolsbyPopper,
    Reock,
    RegionPieces,
    RegionSplits,
    Seats,
    SwingDistricts,
)

from ensembles.graph import COUNTY_COL, POP_COL, county_of, election_columns
from transforms.graph import _gpkg_layer_name

logger = logging.getLogger(__name__)

TARGET_CRS = "EPSG:5070"
COMPETITIVE_MARGIN = 0.03
CHUNK_PLANS = 10_000
COMPACTNESS = ("polsby_popper", "reock")
ELECTION_SEPARATOR = "__"

# Per-election metrics: id -> (gerrytools class, extra positional arguments after the
# party and opposition vote columns). Every class is built with the Democratic column as
# the party, except ``rep_seats``, which swaps the two.
PER_ELECTION = {
    "seats": (Seats, ()),
    "rep_seats": (Seats, ()),
    "efficiency_gap": (EfficiencyGap, ()),
    "mean_median": (MeanMedian, ()),
    "partisan_bias": (PartisanBias, ()),
    "disproportionality": (Disproportionality, ()),
    "eguia": (Eguia, (COUNTY_COL, POP_COL)),
    "district_vote_shares": (DistrictVoteShares, ()),
}

# Cross-election metrics: id -> (gerrytools class, extra constructor options).
CROSS_ELECTION = {
    "n_dem_districts": (PartyDistricts, {}),
    "n_rep_districts": (OppositionPartyDistricts, {}),
    "n_swing_districts": (SwingDistricts, {}),
    "n_competitive_contests": (
        CompetitiveContests,
        {"vote_share_margin": COMPETITIVE_MARGIN},
    ),
}

DEFINITIONS = {
    "seats": "gerrytools.scoring.Seats(<e>_dem, <e>_rep): districts the Democrat "
    "strictly wins.",
    "rep_seats": "gerrytools.scoring.Seats(<e>_rep, <e>_dem): districts the "
    "Republican strictly wins.",
    "efficiency_gap": "gerrytools.scoring.EfficiencyGap(<e>_dem, <e>_rep): wasted-vote "
    "efficiency gap, positive favours Democrats.",
    "mean_median": "gerrytools.scoring.MeanMedian(<e>_dem, <e>_rep): median minus mean "
    "district Democratic vote share.",
    "partisan_bias": "gerrytools.scoring.PartisanBias(<e>_dem, <e>_rep, "
    "turnout_model='equal'): Democratic seat share above one half at 50% under uniform "
    "swing.",
    "disproportionality": "gerrytools.scoring.Disproportionality(<e>_dem, <e>_rep): "
    "Democratic seat share minus statewide Democratic two-party vote share.",
    "eguia": f"gerrytools.scoring.Eguia(<e>_dem, <e>_rep, '{COUNTY_COL}', "
    f"'{POP_COL}'): Democratic seat share minus the population share of counties the "
    "Democrat wins.",
    "district_vote_shares": "gerrytools.scoring.DistrictVoteShares(<e>_dem, <e>_rep): "
    "Democratic two-party vote share of each district.",
    "n_dem_districts": "gerrytools.scoring.PartyDistricts: districts the Democrat "
    "strictly wins in every election.",
    "n_rep_districts": "gerrytools.scoring.OppositionPartyDistricts: districts the "
    "Republican strictly wins in every election.",
    "n_swing_districts": "gerrytools.scoring.SwingDistricts: districts that are not "
    "strict wins for one party in every election.",
    "n_competitive_contests": "gerrytools.scoring.CompetitiveContests("
    f"vote_share_margin={COMPETITIVE_MARGIN}): (district, election) contests with a "
    "Democratic two-party share strictly within the margin of 50%.",
    "county_splits": f"gerrytools.scoring.RegionSplits('{COUNTY_COL}'): counties "
    "assigned to more than one district.",
    "county_pieces": f"gerrytools.scoring.RegionPieces('{COUNTY_COL}'): occupied "
    "(county, district) pairs; a county entirely inside one district counts 1.",
    "polsby_popper": "gerrytools.scoring.PolsbyPopper: 4 * pi * area / perimeter^2 per "
    "district, from EPSG:5070 geometry; _mean, _min and _max are across districts.",
    "reock": "gerrytools.scoring.Reock: district area divided by the area of its minimum "
    "enclosing circle, from EPSG:5070 geometry; _mean, _min and _max are across "
    "districts.",
}


def election_keys(columns) -> list[str]:
    """Election keys (``pres_24``) having both a ``_dem`` and a ``_rep`` column."""
    cols = set(election_columns(columns))
    return sorted(c[: -len("_dem")] for c in cols if c.endswith("_dem"))


def series_key(metric: str, election: str) -> str:
    return f"{metric}{ELECTION_SEPARATOR}{election}"


def load_geometry(vtd_gpkg: str | Path) -> gpd.GeoDataFrame:
    """VTD rows indexed by path: geometry, population, election tallies and county."""
    layer = _gpkg_layer_name(vtd_gpkg)
    gdf = gpd.read_file(vtd_gpkg, layer=layer).set_index("path")
    keep = [c for c in [POP_COL, *election_columns(gdf.columns)] if c in gdf.columns]
    gdf = gdf[[*keep, "geometry"]]
    gdf[COUNTY_COL] = [county_of(path) for path in gdf.index]
    return gdf


def build_metrics(elections: list[str]) -> list:
    metrics = []
    for e in elections:
        dem, rep = f"{e}_dem", f"{e}_rep"
        for metric, (cls, extra) in PER_ELECTION.items():
            party, opposition = (rep, dem) if metric == "rep_seats" else (dem, rep)
            metrics.append(
                cls(party, opposition, *extra, result_name=series_key(metric, e))
            )
    if elections:
        dems = tuple(f"{e}_dem" for e in elections)
        reps = tuple(f"{e}_rep" for e in elections)
        for metric, (cls, options) in CROSS_ELECTION.items():
            metrics.append(cls(dems, reps, result_name=metric, **options))
    metrics += [
        Reock(),
        PolsbyPopper(),
        RegionSplits(COUNTY_COL, result_name="county_splits"),
        RegionPieces(COUNTY_COL, result_name="county_pieces"),
    ]
    return metrics


def score_ensemble(
    npz_path: str | Path, vtd_gpkg: str | Path, n_plans: int | None
) -> dict:
    """Score the first ``n_plans`` plans of a packed ensemble npz (``None`` for all).

    Returns ``{"arrays": {name: array}, "elections": [...], "n_plans", "num_dists",
    "wall_time_seconds"}``.
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
    elections = election_keys(gdf.columns)

    graph = nx.Graph()
    graph.add_nodes_from(node_ids)  # no edges: these metrics don't need adjacency
    evaluator = PlanEvaluator(graph, geometry=gdf, target_crs=TARGET_CRS)
    evaluator.add_metrics(*build_metrics(elections))

    start = time.monotonic()
    chunks: dict[str, list[np.ndarray]] = {}
    for lo in range(0, len(assignments), CHUNK_PLANS):
        result = evaluator.evaluate_many(assignments[lo : lo + CHUNK_PLANS])
        for name in evaluator.metrics:
            chunks.setdefault(name, []).append(_as_array(result[name]))
        logger.info(
            "Scored %d/%d plans",
            min(lo + CHUNK_PLANS, len(assignments)),
            len(assignments),
        )
    wall_time = time.monotonic() - start
    logger.info(
        "Scored %d plans in %.1fs (%.2f ms/plan)",
        len(assignments),
        wall_time,
        1000 * wall_time / len(assignments),
    )

    arrays = {name: np.concatenate(parts) for name, parts in chunks.items()}
    for metric in COMPACTNESS:
        arrays[f"{metric}_mean"] = arrays[metric].mean(axis=1)
        arrays[f"{metric}_min"] = arrays[metric].min(axis=1)
        arrays[f"{metric}_max"] = arrays[metric].max(axis=1)
    return {
        "arrays": arrays,
        "elections": elections,
        "n_plans": int(len(assignments)),
        "num_dists": int(arrays["reock"].shape[1]),
        "wall_time_seconds": wall_time,
    }


def _as_array(values) -> np.ndarray:
    """A gerrytools result as an array: plan series stay 1-D, district frames are
    sorted by district id."""
    if values.ndim == 2:
        values = values.sort_index(axis=1)
    return values.to_numpy()


def write_npz(out_path: str | Path, facts: dict) -> None:
    np.savez_compressed(
        out_path,
        **facts["arrays"],
        elections=np.array(facts["elections"]),
        n_plans=facts["n_plans"],
    )


def write_manifest(
    path: str | Path, source_npz: str | Path, vtd_gpkg: str | Path, facts: dict
) -> None:
    manifest = {
        "source_npz": str(source_npz),
        "vtd_gpkg": str(vtd_gpkg),
        "n_plans": facts["n_plans"],
        "num_dists": facts["num_dists"],
        "elections": facts["elections"],
        "gerrytools_version": importlib.metadata.version("gerrytools"),
        "crs": TARGET_CRS,
        "definitions": DEFINITIONS,
        "wall_time_seconds": facts["wall_time_seconds"],
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    Path(path).write_text(json.dumps(manifest, indent=1))
