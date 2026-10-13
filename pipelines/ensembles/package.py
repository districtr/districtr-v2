"""Build the static data package the app reads for an ensemble module.

Layout under ``<ensemble dir>/package/``:

- ``index.json`` — module slug and the packaged presets.
- ``<preset>/summary.json`` — the distribution of every scored series over the
  ensemble, plus the share of plans passing the Freedom to Vote Act test.
- ``<preset>/segment.json`` — every metric of ``SEGMENT_LENGTH`` consecutive plans,
  shaped like the app's document evaluation payload.
- ``<preset>/thumbs/NNN.svg`` — one district map per segment step.
- ``<preset>/manifest.json`` — chain and scoring manifests plus package facts.

District ids in the package are the app's 1-based zone numbers (npz index + 1).
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely

from ensembles.presets import DEFAULT_PRESET, PRESETS
from transforms.graph import _gpkg_layer_name

logger = logging.getLogger(__name__)

PACKAGE_VERSION = 1
PACKAGE_DIRNAME = "package"
SEGMENT_START = 50_000
SEGMENT_LENGTH = 100
CONTINUOUS_BUCKETS = 100
QUANTILES = np.linspace(0.0, 1.0, 201)
SIGNIFICANT_DIGITS = 6
# A float series taking at most this many distinct values is stored as those
# exact values with counts (``kind: discrete``) rather than as equal-width
# buckets: a seat share minus a fixed vote share, say, lands on a handful of
# points, and bucket centres would misstate them.
DISCRETE_MAX_VALUES = 32

PER_ELECTION_SUMMARY = (
    "seats",
    "efficiency_gap",
    "mean_median",
    "partisan_bias",
    "disproportionality",
    "eguia",
)
PER_ELECTION_SEGMENT = PER_ELECTION_SUMMARY[1:]
PLAN_SUMMARY = (
    "n_dem_districts",
    "n_rep_districts",
    "n_swing_districts",
    "n_competitive_contests",
    "county_splits",
    "county_pieces",
    "cut_edges",
)
COMPACTNESS = ("polsby_popper", "reock")
COMPACTNESS_AGGREGATES = ("mean", "min", "max")

# Freedom to Vote Act (S.2747) proportionality test, as the app's evaluation panel
# applies it (app/src/app/utils/elections.ts, EvalPanel/PartisanSection.tsx).
FTV_MIN_THRESHOLD = 0.07
FTV_REQUIRED_PASSES = 3
FTV_FLOAT_TOLERANCE = 1e-9

THUMB_VIEWBOX_WIDTH = 1000
THUMB_MAX_BYTES = 10_000
# The app's zone palette (app/src/app/constants/colors.ts, colorScheme); zone k takes
# entry (k - 1) modulo its length.
ZONE_COLORS = (
    "#0099cd",
    "#ffca5d",
    "#00cd99",
    "#99cd00",
    "#cd0099",
    "#aa44ef",
    "#8dd3c7",
    "#bebada",
    "#fb8072",
    "#80b1d3",
    "#fdb462",
    "#b3de69",
    "#fccde5",
    "#bc80bd",
    "#ccebc5",
    "#ffed6f",
    "#ffffb3",
    "#a6cee3",
    "#1f78b4",
    "#b2df8a",
    "#33a02c",
    "#fb9a99",
    "#e31a1c",
    "#fdbf6f",
    "#ff7f00",
    "#cab2d6",
    "#6a3d9a",
    "#b15928",
    "#64ffda",
    "#00B8D4",
    "#A1887F",
    "#76FF03",
    "#DCE775",
    "#B388FF",
    "#FF80AB",
    "#D81B60",
    "#26A69A",
    "#FFEA00",
    "#6200EA",
)


def _round(x: float) -> float:
    return float(f"{float(x):.{SIGNIFICANT_DIGITS}g}")


def _rounded(values) -> list[float]:
    return [_round(v) for v in values]


def load_scores(path: str | Path) -> dict:
    """A ``<preset>.scores.npz`` (see ``ensembles.score``) as ``{"arrays",
    "elections", "n_plans", "num_dists"}``."""
    data = np.load(path)
    arrays = {k: data[k] for k in data.files if k not in ("elections", "n_plans")}
    return {
        "arrays": arrays,
        "elections": [str(e) for e in data["elections"]],
        "n_plans": int(data["n_plans"]),
        "num_dists": int(arrays["reock"].shape[1]),
    }


# ── Distributions ─────────────────────────────────────────────────────────────


def distribution(values: np.ndarray) -> dict:
    """Bucket counts and order statistics of one per-plan series.

    Integer-dtype series get one bucket per integer from min to max: bucket ``i``
    counts plans whose value is ``edges[i]`` (``edges[i + 1] = edges[i] + 1``).
    A float series with at most ``DISCRETE_MAX_VALUES`` distinct values is
    ``discrete``: ``edges`` lists those values in order and ``counts[i]`` the plans
    at ``edges[i]``. Other series get ``CONTINUOUS_BUCKETS`` equal-width buckets
    over min..max, each half-open except the last, which includes max, plus
    ``quantiles`` at ``QUANTILES`` (linear interpolation). Non-finite values are
    excluded and counted in ``n_missing``.
    """
    values = np.asarray(values)
    finite = values[np.isfinite(values)] if values.dtype.kind == "f" else values
    if finite.size == 0:
        raise ValueError("Series has no finite values")
    lo, hi = finite.min(), finite.max()
    result: dict = {}
    if np.issubdtype(values.dtype, np.integer):
        result["kind"] = "integer"
        result["edges"] = list(range(int(lo), int(hi) + 2))
        result["counts"] = np.bincount(finite - lo).tolist()
        result["median"] = _round(np.median(finite))
        result["min"] = int(lo)
        result["max"] = int(hi)
    elif len(distinct := np.unique(finite)) <= DISCRETE_MAX_VALUES:
        result["kind"] = "discrete"
        result["edges"] = _rounded(distinct)
        result["counts"] = [int((finite == v).sum()) for v in distinct]
        result["median"] = _round(np.median(finite))
        result["min"] = _round(lo)
        result["max"] = _round(hi)
    else:
        result["kind"] = "continuous"
        if lo == hi:
            edges = np.array([lo, hi])
            counts = np.array([finite.size])
        else:
            edges = np.linspace(lo, hi, CONTINUOUS_BUCKETS + 1)
            counts, _ = np.histogram(finite, bins=edges)
        result["edges"] = _rounded(edges)
        result["counts"] = counts.tolist()
        result["median"] = _round(np.median(finite))
        result["min"] = _round(lo)
        result["max"] = _round(hi)
        result["quantiles"] = _rounded(np.quantile(finite, QUANTILES))
    if finite.size != values.size:
        result["n_missing"] = int(values.size - finite.size)
    return result


def ftv_elections(elections: list[str]) -> list[str] | None:
    """The two most recent ``pres_*`` and two most recent ``sen_*`` elections, or
    ``None`` when either pair is incomplete (``selectFtvElections`` in the app)."""

    def year(key: str) -> int:
        return 2000 + int(key.split("_")[-1])

    def top_two(office: str) -> list[str]:
        keys = [e for e in elections if e.split("_")[0] == office]
        return sorted(keys, key=year, reverse=True)[:2]

    pres, sen = top_two("pres"), top_two("sen")
    if len(pres) < 2 or len(sen) < 2:
        return None
    return [*pres, *sen]


def ftv_summary(
    disproportionality: dict[str, np.ndarray], elections: list[str], num_dists: int
) -> dict | None:
    """Share of plans with ``|disproportionality| <= threshold`` in at least
    ``FTV_REQUIRED_PASSES`` of the FTV elections."""
    keys = ftv_elections(elections)
    if keys is None:
        return None
    threshold = max(FTV_MIN_THRESHOLD, 1 / num_dists)
    passes = sum(
        (np.abs(disproportionality[k]) <= threshold + FTV_FLOAT_TOLERANCE).astype(int)
        for k in keys
    )
    return {
        "elections": keys,
        "threshold": _round(threshold),
        "share_passing": _round(np.mean(passes >= FTV_REQUIRED_PASSES)),
    }


def summary(scores: dict, cut_edges: np.ndarray, cut_edges_unit: str = "vtd") -> dict:
    """``summary.json`` for one preset from its scores and per-plan cut edges."""
    arrays, elections = scores["arrays"], scores["elections"]
    out: dict = {
        "n_plans": scores["n_plans"],
        "num_dists": scores["num_dists"],
        "elections": elections,
    }
    for metric in PER_ELECTION_SUMMARY:
        out[metric] = {e: distribution(arrays[f"{metric}__{e}"]) for e in elections}
    plan_arrays = {**arrays, "cut_edges": cut_edges[: scores["n_plans"]]}
    for metric in PLAN_SUMMARY:
        out[metric] = distribution(plan_arrays[metric])
    out["cut_edges"]["unit_type"] = cut_edges_unit
    for metric in COMPACTNESS:
        out[metric] = {
            agg: distribution(arrays[f"{metric}_{agg}"])
            for agg in COMPACTNESS_AGGREGATES
        }
        out[metric]["districts"] = distribution(arrays[metric].ravel())
    ftv = ftv_summary(
        {e: arrays[f"disproportionality__{e}"] for e in elections},
        elections,
        scores["num_dists"],
    )
    if ftv is not None:
        out["ftv"] = ftv
    return out


# ── Cut edges ─────────────────────────────────────────────────────────────────


def block_cut_edges(
    assignments: np.ndarray, node_ids: np.ndarray, graph_npz: str | Path
) -> np.ndarray:
    """Block-level cut edges of VTD-level plans, from the combined graph's
    ``weighted_edges`` (the number of block adjacencies between each pair of
    adjacent VTDs; see ``transforms/graph.py``). A block edge is cut exactly
    when its two VTDs sit in different districts, so the count is the weight
    sum over the plan's cut VTD edges. This is the count the app reports for a
    shatterable module (``block_cut_edges`` in backend/app/evaluation)."""
    graph = np.load(graph_npz, allow_pickle=False)
    if not bool(graph["has_weighted_edges"]):
        raise ValueError(f"{graph_npz} carries no block-edge weights")
    graph_ids = graph["node_ids"]
    column = {node: i for i, node in enumerate(node_ids.tolist())}
    keys, weights = graph["we_keys"], graph["we_vals"].astype(np.int64)
    try:
        left = np.array([column[graph_ids[a]] for a in keys[:, 0]])
        right = np.array([column[graph_ids[b]] for b in keys[:, 1]])
    except KeyError as missing:
        raise ValueError(f"Graph VTD {missing} is not an ensemble node") from None
    counts = np.empty(len(assignments), dtype=np.int64)
    for start in range(0, len(assignments), 10_000):
        block = assignments[start : start + 10_000]
        cut = block[:, left] != block[:, right]
        counts[start : start + len(block)] = cut @ weights
    return counts


# ── Segment ───────────────────────────────────────────────────────────────────


def segment_start(n_plans: int, start: int = SEGMENT_START) -> int:
    """``start``, moved back when the ensemble is too short to hold a full segment."""
    clamped = max(0, min(start, n_plans - SEGMENT_LENGTH))
    if clamped != start:
        logger.warning("Ensemble has %d plans; segment starts at %d", n_plans, clamped)
    return clamped


def segment_step(
    scores: dict, cut_edges: np.ndarray, plan: int, cut_edges_unit: str = "vtd"
) -> dict:
    """Every metric of one plan, keyed and shaped like the app's evaluation payload
    (``DocumentEvaluation`` in app/src/app/utils/api/apiHandlers/getEvaluation.ts)."""
    arrays, elections = scores["arrays"], scores["elections"]
    num_dists = scores["num_dists"]
    zones = range(1, num_dists + 1)
    step: dict = {
        "plan": plan,
        "seats": {
            e: {
                "dem": int(arrays[f"seats__{e}"][plan]),
                "rep": int(arrays[f"rep_seats__{e}"][plan]),
                "total": num_dists,
            }
            for e in elections
        },
    }
    for metric in PER_ELECTION_SEGMENT:
        step[metric] = {e: _round(arrays[f"{metric}__{e}"][plan]) for e in elections}
    step["competitiveness"] = _competitiveness(arrays, elections, plan, num_dists)
    for metric in COMPACTNESS:
        step[metric] = {
            str(z): _round(v) for z, v in zip(zones, arrays[metric][plan], strict=True)
        }
    step["cut_edges"] = {"cut_count": int(cut_edges[plan]), "unit_type": cut_edges_unit}
    step["county_splits"] = {
        "splits": int(arrays["county_splits"][plan]),
        "pieces": int(arrays["county_pieces"][plan]),
    }
    return step


def _competitiveness(
    arrays: dict, elections: list[str], plan: int, num_dists: int
) -> dict:
    """The app's ``CompetitivenessResult`` from gerrytools' per-district Democratic
    vote shares: a district is a sweep for a party that strictly wins it in every
    election; contest shares list every finite (district, election) share ascending.
    Sweep counts are checked against gerrytools' PartyDistricts and
    OppositionPartyDistricts."""
    shares = np.array([arrays[f"district_vote_shares__{e}"][plan] for e in elections])
    dem_sweep = np.all(shares > 0.5, axis=0)
    rep_sweep = np.all(shares < 0.5, axis=0)
    if (
        dem_sweep.sum() != arrays["n_dem_districts"][plan]
        or rep_sweep.sum() != (arrays["n_rep_districts"][plan])
    ):
        raise AssertionError(f"Sweep districts disagree with gerrytools at plan {plan}")
    zones = np.arange(1, num_dists + 1)
    contest = shares[np.isfinite(shares)]
    return {
        "dem_sweep_districts": zones[dem_sweep].tolist(),
        "rep_sweep_districts": zones[rep_sweep].tolist(),
        "swing_districts": zones[~(dem_sweep | rep_sweep)].tolist(),
        "contest_dem_vote_shares": _rounded(np.sort(contest)),
        "n_districts": num_dists,
        "n_elections": len(elections),
    }


def segment(
    scores: dict, cut_edges: np.ndarray, start: int, cut_edges_unit: str = "vtd"
) -> dict:
    return {
        "start": start,
        "steps": [
            segment_step(scores, cut_edges, plan, cut_edges_unit)
            for plan in range(start, start + SEGMENT_LENGTH)
        ],
    }


# ── Thumbnails ────────────────────────────────────────────────────────────────


def load_coverage(vtd_gpkg: str | Path, node_ids: np.ndarray) -> np.ndarray:
    """VTD polygons in EPSG:5070, in ``node_ids`` order."""
    gdf = gpd.read_file(vtd_gpkg, layer=_gpkg_layer_name(vtd_gpkg))
    gdf = gdf[["path", "geometry"]].set_index("path").to_crs("EPSG:5070")
    return gdf.loc[node_ids].geometry.to_numpy()


class DistrictDissolver:
    """Dissolves VTD polygons into districts, reusing the union of any district whose
    VTD set is unchanged since an earlier plan (consecutive chain steps redraw two)."""

    def __init__(self, coverage: np.ndarray):
        self.coverage = coverage
        self._cache: dict[bytes, shapely.Geometry] = {}

    def districts(self, assignment: np.ndarray, num_dists: int) -> list:
        out = []
        for k in range(num_dists):
            mask = assignment == k
            key = np.packbits(mask).tobytes()
            if key not in self._cache:
                self._cache[key] = shapely.coverage_union_all(self.coverage[mask])
            out.append(self._cache[key])
        if len(self._cache) > 4 * num_dists:
            keep = {np.packbits(assignment == k).tobytes() for k in range(num_dists)}
            self._cache = {k: v for k, v in self._cache.items() if k in keep}
        return out


def thumbnail_svg(
    districts: list,
    bounds: tuple[float, float, float, float],
    max_bytes: int = THUMB_MAX_BYTES,
) -> str:
    """An SVG map of ``districts`` (zone k = ``districts[k - 1]``) filled with the zone
    palette and separated by thin white borders, fitted to ``bounds``.

    Districts are simplified together as a coverage (no gaps or overlaps appear),
    starting at one viewBox unit of tolerance and coarsening until the file fits in
    ``max_bytes``."""
    minx, miny, maxx, maxy = bounds
    scale = THUMB_VIEWBOX_WIDTH / (maxx - minx)
    height = round((maxy - miny) * scale)
    tolerance = 1 / scale
    while True:
        simplified = shapely.coverage_simplify(np.array(districts), tolerance)
        paths = [
            f'<path data-district="{zone}" fill="{ZONE_COLORS[(zone - 1) % len(ZONE_COLORS)]}"'
            ' vector-effect="non-scaling-stroke"'
            f' d="{_path_data(geom, minx, maxy, scale)}"/>'
            for zone, geom in enumerate(simplified, start=1)
        ]
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {THUMB_VIEWBOX_WIDTH} {height}">'
            '<g stroke="#fff" stroke-width="1" stroke-linejoin="round" '
            'fill-rule="evenodd">' + "".join(paths) + "</g></svg>"
        )
        if len(svg.encode()) <= max_bytes:
            return svg
        if tolerance > maxx - minx:
            raise ValueError(f"Districts cannot be drawn in {max_bytes} bytes")
        tolerance *= 1.5


def _path_data(geom, minx: float, maxy: float, scale: float) -> str:
    """SVG path data for a (multi)polygon in integer viewBox units, y pointing down."""
    parts = []
    for polygon in getattr(geom, "geoms", [geom]):
        if polygon.is_empty:
            continue
        for ring in [polygon.exterior, *polygon.interiors]:
            xy = np.asarray(ring.coords)[:-1]
            pts = np.rint(
                np.column_stack([(xy[:, 0] - minx) * scale, (maxy - xy[:, 1]) * scale])
            ).astype(int)
            keep = np.ones(len(pts), dtype=bool)
            keep[1:] = np.any(pts[1:] != pts[:-1], axis=1)
            pts = pts[keep]
            if len(pts) < 3:
                continue
            coords = " ".join(f"{x} {y}" for x, y in pts[1:])
            parts.append(f"M{pts[0][0]} {pts[0][1]}L{coords}Z")
    return "".join(parts)


# ── Package ───────────────────────────────────────────────────────────────────


def _public_manifest(manifest: dict, path_keys: tuple[str, ...]) -> dict:
    """``manifest`` with local file paths reduced to file names."""
    out = dict(manifest)
    for key in path_keys:
        if out.get(key):
            out[key] = Path(out[key]).name
    if "seed" in out:
        out["seed"] = {**out["seed"], "source": Path(out["seed"]["source"]).name}
    if "rustrecom_config" in out:
        out["rustrecom_config"] = _public_manifest(
            out["rustrecom_config"], ("graph_json", "output_file")
        )
    return out


def write_preset(
    ensemble_dir: str | Path,
    preset_key: str,
    vtd_gpkg: str | Path,
    start: int = SEGMENT_START,
    graph_npz: str | Path | None = None,
) -> Path:
    """Write ``package/<preset>/`` from ``<preset>.npz``, ``<preset>.scores.npz``
    and their manifests in ``ensemble_dir``; returns the preset folder.

    With ``graph_npz`` (the module's combined block/VTD graph) cut edges are
    counted between blocks, the unit the app scores a shatterable module in;
    without it they are the chain's VTD-level counts."""
    ensemble_dir = Path(ensemble_dir)
    out = ensemble_dir / PACKAGE_DIRNAME / preset_key
    (out / "thumbs").mkdir(parents=True, exist_ok=True)

    chain_npz = np.load(ensemble_dir / f"{preset_key}.npz")
    scores = load_scores(ensemble_dir / f"{preset_key}.scores.npz")
    if graph_npz is not None:
        cut_edges = block_cut_edges(
            chain_npz["assignments"], chain_npz["node_ids"], graph_npz
        )
        cut_edges_unit = "block"
    else:
        cut_edges = chain_npz["cut_edges"]
        cut_edges_unit = "vtd"

    _write_json(out / "summary.json", summary(scores, cut_edges, cut_edges_unit))

    start = segment_start(scores["n_plans"], start)
    _write_json(out / "segment.json", segment(scores, cut_edges, start, cut_edges_unit))

    coverage = load_coverage(vtd_gpkg, chain_npz["node_ids"])
    bounds = tuple(shapely.total_bounds(coverage))
    dissolver = DistrictDissolver(coverage)
    assignments = chain_npz["assignments"]
    for i in range(SEGMENT_LENGTH):
        districts = dissolver.districts(assignments[start + i], scores["num_dists"])
        (out / "thumbs" / f"{i:03d}.svg").write_text(thumbnail_svg(districts, bounds))

    chain_manifest = json.loads((ensemble_dir / f"{preset_key}.json").read_text())
    score_manifest = json.loads(
        (ensemble_dir / f"{preset_key}.scores.json").read_text()
    )
    _write_json(
        out / "manifest.json",
        {
            "package_version": PACKAGE_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "segment": {"start": start, "length": SEGMENT_LENGTH},
            "cut_edges_unit_type": cut_edges_unit,
            "chain": _public_manifest(chain_manifest, ("graph_json",)),
            "scoring": _public_manifest(score_manifest, ("source_npz", "vtd_gpkg")),
        },
        indent=1,
    )
    return out


def write_index(package_dir: str | Path, module_slug: str) -> dict:
    """Write ``index.json`` listing every preset folder in ``package_dir``, in
    ``PRESETS`` order."""
    package_dir = Path(package_dir)
    found = {
        p.parent.name: json.loads(p.read_text())
        for p in package_dir.glob("*/manifest.json")
    }
    order = [k for k in PRESETS if k in found] + sorted(set(found) - set(PRESETS))
    index = {
        "module_slug": module_slug,
        "presets": [
            {
                "key": key,
                "label": found[key]["chain"]["label"],
                "default": key == DEFAULT_PRESET,
                "n_plans": found[key]["scoring"]["n_plans"],
                "generated_at": found[key]["generated_at"],
            }
            for key in order
        ],
    }
    _write_json(package_dir / "index.json", index, indent=1)
    return index


def upload_targets(package_dir: str | Path, module_slug: str) -> list[tuple[Path, str]]:
    """(local file, S3 key) for every file in ``package_dir``, keyed
    ``ensembles/<module_slug>/<relative path>``."""
    package_dir = Path(package_dir)
    return [
        (path, f"ensembles/{module_slug}/{path.relative_to(package_dir).as_posix()}")
        for path in sorted(package_dir.rglob("*"))
        if path.is_file()
    ]


def content_type(path: Path) -> str:
    return {".json": "application/json", ".svg": "image/svg+xml"}.get(
        path.suffix, "application/octet-stream"
    )


def _write_json(path: Path, data: dict, indent: int | None = None) -> None:
    separators = None if indent else (",", ":")
    path.write_text(json.dumps(data, indent=indent, separators=separators))
