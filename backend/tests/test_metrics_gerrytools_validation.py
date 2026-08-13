"""Cross-validates evaluation metrics (app.evaluation.splits, .compactness,
.partisans) against gerrytools, an independent reference implementation, using
a sample of real production plans.

Which metrics are checked is controlled by ``METRICS_TO_TEST`` below — add an entry
to ``GERRYTOOLS_METRICS`` and to ``METRICS_TO_TEST`` for any new metric with a
gerrytools equivalent.

This is intentionally excluded from CI. It requires large data files that are not
stored in the repository, and a gerrytools reference file that must be generated
offline (gerrytools is never a project dependency — see test_partisan.py's module
docstring for the same convention). Run it in a backend container manually
whenever one of ``METRICS_TO_TEST``'s algorithms changes:

    pytest tests/test_metrics_gerrytools_validation.py -v

Data sources
------------
A 152-document sample of real production plans across 12 map slugs / 5 states
(TX, GA, MI, PA, NY). Two CSVs, git-ignored (the repo's ``data/**/*`` rule),
local under ``data/metrics-validation/``, mirrored at
``s3://districtr-cdn-data-f1eb3d1/test-fixtures/metrics-validation/``:

    prod_sample_documents.csv    (document_id, public_id, districtr_map_slug,
                                  state, gerrydb_table_name, parent_layer,
                                  child_layer, metrics, payload_version,
                                  updated_at — one row per document)
    prod_sample_assignments.csv  (document_id, geo_id, zone — ~1.09M rows)

GerryDB setup
-------------
Uses the local dev database directly (the same one `docker-compose exec
backend ...` and the running app use) — not the ephemeral per-pytest-session
``districtr_test`` DB, and deliberately not a separate persistent integration
DB either (a second multi-GB copy of five states' block-level data is wasteful
disk-wise for something this test can just as well share with local dev).

This test does no loading itself -- it only reads whatever's already in the
DB via DocumentEvaluationContext, and skips (see missing_reference below) any
document_id from the gerrytools reference file that isn't there. Two one-time
setup steps populate that data:

1. The GA/MI/PA/TX/NY v2 modules, the same way any other map module is
   loaded. There's no committed config for just these five states — build one
   by filtering ``management/configs/v2_backend_config.yml`` down to the
   ``gerrydb_views``, ``shatterable_views``, ``districtr_maps``,
   ``map_groups``, and ``map_group_definitions`` entries whose table/slug
   starts with ``ga_``/``mi_``/``pa_``/``tx_``/``ny_``, then run::

       docker-compose exec backend python cli.py batch-create-districtr-maps \\
           -c <your filtered config>.yml -d /data/gerrydb

   The source gpkgs (``data/gerrydb/{state}_districtr_{vtd,block}_view_v2.gpkg``)
   and graphs (``data/graphs/{state}_districtr_view_v2.pkl``) are expected to
   already be present locally (same convention as
   test_fl_metrics_integration.py's data dir).

2. The 152 sample documents themselves, via a dedicated idempotent CLI command
   (see management/load_metrics_validation_documents.py) -- a rerun after the
   first is a no-op for any document already present, so this is safe (and
   cheap) to run again after refreshing the sample CSVs::

       docker-compose exec backend python cli.py load-metrics-validation-documents \\
           -d /data/metrics-validation

Skipped without: the gerrytools reference file below (loading step 2 also
needs the two sample CSVs it reads from).

To regenerate the gerrytools reference file
---------------------------------------------
gerrytools is never a project dependency (Python 3.12, pulls in gerrychain,
whose numpy/networkx pins can conflict with this project's — see
test_partisan.py's module docstring for the same convention), so there's no
runnable script for it in this repo. Set up an isolated venv and run the
logic below directly:

    python3.12 -m venv /tmp/gerrytools-venv
    /tmp/gerrytools-venv/bin/pip install gerrytools

    # /tmp/gerrytools-venv/bin/python (also needs `pip install geopandas` if
    # not pulled in as a gerrytools dependency already):
    #
    # import csv, json, pickle
    # from collections import defaultdict
    # from pathlib import Path
    # import geopandas as gpd
    # from gerrytools.scoring import PlanEvaluator
    # from gerrytools.scoring.metrics import (
    #     EfficiencyGap, MeanMedian, PartisanBias, Disproportionality, Seats,
    # )
    # from gerrytools.scoring.single_plan import region_parts, region_pieces, cut_edges
    #
    # DATA_DIR = Path("data/metrics-validation")
    # GRAPH_DIR = Path("data/graphs")
    # GERRYDB_DIR = Path("data/gerrydb")
    # STATE_PREFIXES = ("ga_", "mi_", "pa_", "tx_", "ny_")
    #
    # # One gerrytools function per "county"-shaped entry in GERRYTOOLS_METRICS.
    # COUNTY_FNS = {"county_parts": region_parts, "county_pieces": region_pieces}
    # # One gerrytools Metric class per "election"-shaped entry (seats' "dem"
    # # field is pulled from its per-election dict the same way as elsewhere).
    # ELECTION_METRIC_CLASSES = {
    #     "efficiency_gap": EfficiencyGap, "mean_median": MeanMedian,
    #     "partisan_bias": PartisanBias, "disproportionality": Disproportionality,
    #     "seats": Seats,
    # }
    #
    # def county_geoid(geo_id):
    #     bare = geo_id.split(":", 1)[1] if ":" in geo_id else geo_id
    #     return bare[:5]
    #
    # def load_vote_attrs(prefix):
    #     # path -> {col: value} for every *_dem/*_rep column, merged across
    #     # the state's vtd and block layers (mirrors the DB's own combined
    #     # view, which is just these two tables unioned on `path`).
    #     # ignore_geometry=True + a vectorized to_dict("index") both matter:
    #     # decoding geometry, or converting row-by-row in a Python loop, each
    #     # turn this from ~1s into several minutes per state.
    #     attrs = {}
    #     for layer in ("vtd", "block"):
    #         gdf = gpd.read_file(
    #             GERRYDB_DIR / f"{prefix}_districtr_{layer}_view_v2.gpkg",
    #             layer=f"{prefix}_districtr_{layer}_view_v2",
    #             ignore_geometry=True,
    #         )
    #         vote_cols = [c for c in gdf.columns if c.endswith(("_dem", "_rep"))]
    #         attrs.update(gdf.set_index("path")[vote_cols].to_dict("index"))
    #     return attrs
    #
    # documents = {}
    # with open(DATA_DIR / "prod_sample_documents.csv") as f:
    #     for row in csv.DictReader(f):
    #         if row["gerrydb_table_name"].startswith(STATE_PREFIXES):
    #             documents[row["document_id"]] = row
    #
    # assignments_by_doc = defaultdict(list)
    # with open(DATA_DIR / "prod_sample_assignments.csv") as f:
    #     for row in csv.DictReader(f):
    #         if row["document_id"] in documents and row["zone"] != "":
    #             assignments_by_doc[row["document_id"]].append(
    #                 (row["geo_id"], int(row["zone"]))
    #             )
    #
    # graph_cache, vote_attrs_cache = {}, {}
    # reference = {k: {} for k in (*COUNTY_FNS, "cut_edges", *ELECTION_METRIC_CLASSES)}
    # for document_id, assignments in assignments_by_doc.items():
    #     doc = documents[document_id]
    #     prefix = doc["gerrydb_table_name"].split("_", 1)[0]
    #     if prefix not in graph_cache:
    #         with open(GRAPH_DIR / f"{prefix}_districtr_view_v2.pkl", "rb") as f:
    #             graph_cache[prefix] = pickle.load(f)
    #         vote_attrs_cache[prefix] = load_vote_attrs(prefix)
    #     G, vote_attrs = graph_cache[prefix], vote_attrs_cache[prefix]
    #     assignment = {g: z for g, z in assignments if g in G}
    #
    #     # county_parts / county_pieces: region_parts/region_pieces (gerrytools
    #     # 2.0.1) always return one aggregate number across every group in
    #     # region_attrs, never a per-group breakdown, and require the
    #     # assignment's keys to exactly match the graph's node set -- call
    #     # once per county, on a subgraph induced on that county's nodes,
    #     # with a node attribute set to the county's own geoid (region_attrs
    #     # just needs an existing, constant node attribute; the value only
    #     # matters for readability since the subgraph is already
    #     # county-restricted).
    #     nodes_by_county = defaultdict(list)
    #     for geo_id in assignment:
    #         nodes_by_county[county_geoid(geo_id)].append(geo_id)
    #     for metric_key, fn in COUNTY_FNS.items():
    #         county_counts = {}
    #         for county, nodes in nodes_by_county.items():
    #             subgraph = G.subgraph(nodes)
    #             for n in nodes:
    #                 G.nodes[n]["county"] = county
    #             county_counts[county] = fn(
    #                 subgraph, {n: assignment[n] for n in nodes}, region_attrs="county"
    #             )
    #         reference[metric_key][document_id] = county_counts
    #
    #     # partisan metrics: unlike region_parts/region_pieces these ARE
    #     # single aggregate numbers per (metric, election) -- no per-county
    #     # breakdown needed. Calling gerrytools' single_plan.* wrapper once
    #     # per (metric, election) pair re-converts the whole assigned
    #     # subgraph into gerrytools' internal structures on every call;
    #     # batching every metric into one PlanEvaluator + one evaluate()
    #     # call converts the graph once and was ~50x faster in testing (0.1s
    #     # vs several seconds per document).
    #     for n in assignment:
    #         if n in vote_attrs:
    #             for col, val in vote_attrs[n].items():
    #                 G.nodes[n][col] = val
    #     plan_subgraph = G.subgraph(assignment.keys())
    #     elections = sorted({
    #         col[:-len("_dem")]
    #         for n in assignment if n in vote_attrs
    #         for col in vote_attrs[n] if col.endswith("_dem")
    #     })
    #     metrics = [
    #         cls(f"{e}_dem", f"{e}_rep", result_name=f"{e}__{metric_key}")
    #         for e in elections
    #         for metric_key, cls in ELECTION_METRIC_CLASSES.items()
    #     ]
    #     result = dict(PlanEvaluator(plan_subgraph).add_metrics(*metrics).evaluate(assignment))
    #     for metric_key in ELECTION_METRIC_CLASSES:
    #         reference[metric_key][document_id] = {
    #             e: result[f"{e}__{metric_key}"] for e in elections
    #         }
    #
    #     # cut_edges: gerrytools counts edges on exactly the nodes given, with
    #     # no notion of "whole parent unit" -- expand every whole-VTD
    #     # assignment down to its child blocks first (using the graph's own
    #     # parent->children map) so this counts the same block-level cut
    #     # edges our own block_cut_edges does.
    #     block_assignment = {}
    #     for geo_id, zone in assignment.items():
    #         children = G.nodes[geo_id].get("children")
    #         if children:
    #             for child in children:
    #                 block_assignment[child] = zone
    #         else:
    #             block_assignment[geo_id] = zone
    #     block_subgraph = G.subgraph(block_assignment.keys())
    #     reference["cut_edges"][document_id] = cut_edges(block_subgraph, block_assignment)
    #
    # with open(DATA_DIR / "gerrytools_metrics_reference.json", "w") as f:
    #     json.dump(reference, f)

This reference file (like the two sample CSVs) is git-ignored; regenerate it
locally, or pull a maintained copy from
``s3://districtr-cdn-data-f1eb3d1/test-fixtures/metrics-validation/gerrytools_metrics_reference.json``
if one has been uploaded there.

Scope note
----------
This only cross-validates the counts/values gerrytools' independent
implementation also computes, for whichever metrics are in ``METRICS_TO_TEST``.
Compactness (``polsby_popper``, ``reock``) is out of scope: gerrytools computes
those from geometry, not the graph, which is a materially different harness,
and they're already checked against a published report's ground truth in
test_fl_metrics_integration.py. ``eguia`` is also out of scope: our
implementation's benchmark term is computed from every county in the state
regardless of the document's assignment (see ``eguia_county``'s docstring in
app.evaluation.partisans), which doesn't fit gerrytools' single_plan API's
assignment-must-match-graph-nodes contract without extra plumbing.
``component_populations`` (this codebase's own forced-minimum-split precompute,
document-independent) has no gerrytools equivalent either; it's covered by the
unit/integration tests in test_county_context.py and test_splits.py instead.
"""

import json
import math
from pathlib import Path

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import text
from sqlmodel import Session

import app.evaluation.partisans as partisans
from app.core.db import engine as app_engine
from app.evaluation.compactness import block_cut_edges
from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.splits import county_parts, county_pieces

TESTS_DIR = Path(__file__).parent
REPO_ROOT = TESTS_DIR.parent.parent
DATA_DIR = REPO_ROOT / "data"
METRICS_VALIDATION_DIR = DATA_DIR / "metrics-validation"

GERRYTOOLS_REFERENCE_JSON = METRICS_VALIDATION_DIR / "gerrytools_metrics_reference.json"

# metric key -> (our compute function, result shape, comparison kind, field).
#
# shape is how the reference JSON is keyed per document:
#   "county"   {county_geoid: count}  (county_parts, county_pieces)
#   "election" {election: value}      (the partisan metrics)
#   "scalar"   a single value          (cut_edges)
# field is the key to pull out of each per-shape-key result when our compute
# function returns a per-key dict (e.g. CountyPartsInfo's "parts") instead of
# a bare comparable value; None means the value is already bare.
# kind controls comparison tolerance: "int" compares exactly, "float" allows
# for floating-point summation-order differences between the two
# implementations.
GERRYTOOLS_METRICS = {
    "county_parts": (county_parts, "county", "int", "parts"),
    "county_pieces": (county_pieces, "county", "int", "pieces"),
    "cut_edges": (block_cut_edges, "scalar", "int", "cut_count"),
    "efficiency_gap": (partisans.efficiency_gap, "election", "float", None),
    "mean_median": (partisans.mean_median, "election", "float", None),
    "partisan_bias": (partisans.partisan_bias, "election", "float", None),
    "disproportionality": (partisans.disproportionality, "election", "float", None),
    "seats": (partisans.seats, "election", "int", "dem"),
}

# Edit this to control which of GERRYTOOLS_METRICS get checked.
METRICS_TO_TEST: tuple[str, ...] = tuple(GERRYTOOLS_METRICS)

pytestmark = pytest.mark.skipif(
    not GERRYTOOLS_REFERENCE_JSON.exists(),
    reason=(
        "gerrytools reference file not present — see the module docstring for "
        "the S3 path and regeneration script."
    ),
)


@pytest.fixture(scope="module")
def gerrytools_reference() -> dict[str, dict[str, object]]:
    """metric_key -> document_id -> value, from the offline gerrytools run
    documented in the module docstring. The value's shape depends on the
    metric's entry in GERRYTOOLS_METRICS: a {county_geoid: count} dict, an
    {election: value} dict, or a bare scalar."""
    with open(GERRYTOOLS_REFERENCE_JSON) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def local_db_session():
    """Module-scoped session against the regular local dev database (the same
    one `docker-compose exec backend ...` and the running app use) -- not the
    ephemeral per-pytest-session `districtr_test` DB, and not a separate
    persistent integration DB either. Keeping the four states' gerrydb data in
    the one DB that's already on disk for local dev avoids a second multi-GB
    copy (see the module docstring for the one-time gerrydb load this test
    depends on)."""
    with Session(app_engine, expire_on_commit=True) as session:
        yield session


@pytest.fixture(scope="module")
def document_slugs(local_db_session, gerrytools_reference) -> dict[str, str]:
    """document_id -> districtr_map_slug, for whichever of the gerrytools
    reference's sample documents are already loaded in the local dev DB (see
    the module docstring's setup step 2 -- this test does no loading of its
    own). A reference document_id absent here just shows up as a
    missing_reference entry in all_metric_results below, the same as a
    document gerrytools itself had no entry for."""
    reference_ids = {
        document_id for ref in gerrytools_reference.values() for document_id in ref
    }
    rows = local_db_session.execute(
        text("SELECT document_id, districtr_map_slug FROM document.document")
    ).all()
    # document_id comes back as a uuid.UUID (UUIDType), not the plain str
    # the JSON reference's keys are -- str() it before comparing/keying.
    return {
        str(row.document_id): row.districtr_map_slug
        for row in rows
        if str(row.document_id) in reference_ids
    }


def _keyed_values(shape, field, result):
    """Reduce a compute-function result (ours or gerrytools') to a plain
    {key: comparable value} dict, per GERRYTOOLS_METRICS' shape/field."""
    if shape == "scalar":
        return {"_": dict(result)[field] if field else result}
    entries = dict(result)
    if field is None:
        return entries
    return {key: dict(value)[field] for key, value in entries.items()}


def _values_match(kind, a, b):
    if kind == "float":
        return math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6)
    return a == b


@pytest.fixture(scope="module")
def all_metric_results(local_db_session, document_slugs, gerrytools_reference):
    """One pass over every loaded sample document -- compute every metric in
    METRICS_TO_TEST off the same DocumentEvaluationContext, rather than once
    per metric. With 152 documents x 8 metrics, that would mean 8x the DB
    reads for no benefit, since nothing about a document changes between
    metrics.

    Returns {metric_key: (mismatches, missing_reference, checked)}, consumed
    by the per-metric test below so pytest still reports/fails each metric
    independently.
    """
    session = local_db_session
    mismatches: dict[str, list[str]] = {k: [] for k in METRICS_TO_TEST}
    missing_reference: dict[str, list[str]] = {k: [] for k in METRICS_TO_TEST}
    checked: dict[str, int] = dict.fromkeys(METRICS_TO_TEST, 0)

    for document_id, districtr_map_slug in document_slugs.items():
        ctx = DocumentEvaluationContext(
            background_tasks=BackgroundTasks(),
            session=session,
            document_id=document_id,
        )
        for metric_key in METRICS_TO_TEST:
            metric_reference = gerrytools_reference[metric_key]
            if document_id not in metric_reference:
                missing_reference[metric_key].append(document_id)
                continue

            our_compute, shape, kind, field = GERRYTOOLS_METRICS[metric_key]
            our_values = _keyed_values(shape, field, our_compute(ctx))
            expected_values = _keyed_values(shape, None, metric_reference[document_id])

            # gerrytools' region_parts/region_pieces only iterate counties
            # with at least one assigned unit; a key absent from one side
            # and 0 on the other means "nothing there" on both sides, not
            # a disagreement -- default missing entries to 0 before
            # comparing.
            all_keys = sorted(set(our_values) | set(expected_values))
            disagreements = [
                key
                for key in all_keys
                if not _values_match(
                    kind, our_values.get(key, 0), expected_values.get(key, 0)
                )
            ]
            if disagreements:
                diff = ", ".join(
                    f"{key}: ours={our_values.get(key, 0)} gerrytools={expected_values.get(key, 0)}"
                    for key in disagreements
                )
                mismatches[metric_key].append(
                    f"{document_id} ({districtr_map_slug}): {diff}"
                )
            checked[metric_key] += 1

    return mismatches, missing_reference, checked


@pytest.mark.parametrize("metric_key", METRICS_TO_TEST)
def test_metric_matches_gerrytools_reference(metric_key, all_metric_results):
    mismatches, missing_reference, checked = all_metric_results

    assert (
        checked[metric_key] > 0
    ), "No sample documents had a matching gerrytools reference entry"
    if missing_reference[metric_key]:
        print(
            f"\n{len(missing_reference[metric_key])} sample documents had no gerrytools "
            f"reference entry for {metric_key} (skipped): {missing_reference[metric_key][:10]}"
            + (" ..." if len(missing_reference[metric_key]) > 10 else "")
        )
    assert not mismatches[metric_key], (
        f"{len(mismatches[metric_key])}/{checked[metric_key]} documents disagree with "
        f"the gerrytools reference for {metric_key}:\n"
        + "\n".join(mismatches[metric_key][:20])
        + ("\n..." if len(mismatches[metric_key]) > 20 else "")
    )
