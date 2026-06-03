"""Integration test suite for evaluation metrics on the Cong2026 Florida Congressional plan.

Validation source: "Report on Florida Congressional Redistricting" by Moon Duchin,
May 10, 2026).

This test is intentionally excluded from CI.  It requires large geodata files that
are not stored in the repository.  Run it in a backend container manually whenever 
metrics code changes:

    pytest tests/test_fl_metrics_integration.py -v

Data sources
------------
All files live in the project's R2 bucket under the ``test-fixtures/fl/`` prefix and
must be downloaded manually before running this test suite:

    aws s3 cp s3://$S3_BUCKET/test-fixtures/fl/fl_cong2026_hybrid.txt \
        backend/tests/fixtures/fl/fl_cong2026_hybrid.txt
    aws s3 cp s3://$S3_BUCKET/test-fixtures/fl/fl_vtd_districtr_view.gpkg \
        data/gerrydb/fl_vtd_districtr_view.gpkg
    aws s3 cp s3://$S3_BUCKET/test-fixtures/fl/fl_block_districtr_view.gpkg \
        data/gerrydb/fl_block_districtr_view.gpkg
    aws s3 cp s3://$S3_BUCKET/test-fixtures/fl/fl_districtr_view.pkl \
        data/graphs/fl_districtr_view.pkl

    assignments : tests/fixtures/fl/fl_cong2026_hybrid.txt  (29 417 lines, ~550 KB)
    parent layer: data/gerrydb/fl_vtd_districtr_view.gpkg   (38 MB)
    child layer : data/gerrydb/fl_block_districtr_view.gpkg (576 MB)
    graph       : data/graphs/fl_districtr_view.pkl          (59 MB)

Hybrid assignment file
-----------------------
``fl_cong2026_hybrid.txt`` contains mixed VTD- and block-level assignments for the
Cong2026 plan, derived from the full 390 066-block EOGPCRP2026.txt release file:

  • Intact VTDs (all blocks map to the same district) → one line per VTD (6 950 VTDs).
  • Split VTDs  (blocks span multiple districts)      → one line per block (22 467 blocks
    across 261 VTDs).

To regenerate this file from scratch:

    from pathlib import Path
    import pickle

    GRAPH_PKL   = Path("data/graphs/fl_districtr_view.pkl")
    BLOCK_ASSIGN = Path("PATH_TO_EOGPCRP2026").expanduser()  # raw release file
    OUTPUT       = Path("backend/tests/fixtures/fl/fl_cong2026_hybrid.txt")

    with GRAPH_PKL.open("rb") as fh:
        g = pickle.load(fh)

    block_to_district: dict[str, int] = {}
    with BLOCK_ASSIGN.open() as fh:
        for line in fh:
            geoid, district = line.strip().split(",", 1)
            block_to_district[geoid] = int(district)

    vtd_blocks: dict[str, dict[str, int]] = {}
    for block_id, district in block_to_district.items():
        if block_id not in g.nodes:
            continue
        parent = g.nodes[block_id].get("parent")
        if parent is None:
            continue
        vtd_blocks.setdefault(parent, {})[block_id] = district

    lines: list[str] = []
    for vtd, blocks in sorted(vtd_blocks.items()):
        districts = set(blocks.values())
        if len(districts) == 1:
            lines.append(f"{vtd},{next(iter(districts))}")
        else:
            for block_id, district in sorted(blocks.items()):
                lines.append(f"{block_id},{district}")

    OUTPUT.write_text("\\n".join(lines) + "\\n")

Shatterable map setup
---------------------
A shatterable DistrictrMap is created with VTDs as the parent layer and blocks as the
child layer.

Performance note
----------------
The first run loads 576 MB of block data via ogr2ogr and runs a PostGIS spatial join
to build parent–child edges.  This may take some time.  Subsequent runs on a
**persistent** integration database (``districtr_integration_test``) detect existing
tables and skip the setup entirely.
"""

import pickle
import subprocess
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

import app.evaluation.graph as eval_graph_module
from app.constants import GERRY_DB_SCHEMA
from app.core.db import get_session
from app.core.security import auth
from app.evaluation.validity import population_deviation
from app.evaluation.compactness import polsby_popper, reock, block_cut_edges
from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.partisans import (
    disproportionality,
    efficiency_gap,
    mean_median,
    partisan_bias,
    seats,
    vote_shares,
)
from app.evaluation.splits import county_pieces
from app.main import app
from app.utils import create_districtr_map, create_parent_child_edges, create_shatterable_gerrydb_view
from tests.constants import ACCOUNT_AUTH0_ID, INTEGRATION_OGR2OGR_PG_CONNECTION_STRING

# ── file paths ────────────────────────────────────────────────────────────────

TESTS_DIR = Path(__file__).parent
REPO_ROOT = TESTS_DIR.parent.parent  # …/districtr-v2/
DATA_DIR = REPO_ROOT / "data"

HYBRID_ASSIGNMENT_FILE = TESTS_DIR / "fixtures" / "fl" / "fl_cong2026_hybrid.txt"
VTD_GPKG = DATA_DIR / "gerrydb" / "fl_vtd_districtr_view.gpkg"
BLOCK_GPKG = DATA_DIR / "gerrydb" / "fl_block_districtr_view.gpkg"
GRAPH_PKL = DATA_DIR / "graphs" / "fl_districtr_view.pkl"

FL_DATA_AVAILABLE = all(
    p.exists() for p in [HYBRID_ASSIGNMENT_FILE, VTD_GPKG, BLOCK_GPKG, GRAPH_PKL]
)

pytestmark = pytest.mark.skipif(
    not FL_DATA_AVAILABLE,
    reason=(
        "FL integration data not present. Download all four files from the R2 bucket "
        "under test-fixtures/fl/ — see the module docstring for the aws s3 cp commands."
    ),
)

FL_MAP_SLUG = "fl_districtr_view"
FL_VTD_TABLE = "fl_vtd_districtr_view"
FL_BLOCK_TABLE = "fl_block_districtr_view"
FL_VIEW_NAME = "fl_districtr_view"

# ── report-validated expected values ─────────────────────────────────────────
# Partisan metrics are in **Democratic POV** (positive = Dem advantage),
# obtained by negating the Republican-POV values reported in Table 4.

# Table 1 – plan-wide compactness averages
EXPECTED_AVG_PP = 0.413
EXPECTED_AVG_REOCK = 0.462
# Block-level cut edges: exact from Table 1, tested via the block_cut_edges metric.
EXPECTED_CUT_EDGES = 6797

# Table 2 – per-district Polsby-Popper (Cong2026, CDs 1–28)
EXPECTED_PP_BY_DISTRICT: dict[int, float] = {
    1: 0.478,  2: 0.482,  3: 0.502,  4: 0.318,  5: 0.525,
    6: 0.482,  7: 0.404,  8: 0.442,  9: 0.359, 10: 0.365,
    11: 0.330, 12: 0.407, 13: 0.547, 14: 0.437, 15: 0.257,
    16: 0.372, 17: 0.320, 18: 0.403, 19: 0.384, 20: 0.412,
    21: 0.509, 22: 0.403, 23: 0.460, 24: 0.321, 25: 0.161,
    26: 0.546, 27: 0.691, 28: 0.241,
}

# Table 2 – per-district Reock (Cong2026, CDs 1–28)
EXPECTED_REOCK_BY_DISTRICT: dict[int, float] = {
    1: 0.538,  2: 0.458,  3: 0.573,  4: 0.384,  5: 0.560,
    6: 0.736,  7: 0.468,  8: 0.436,  9: 0.467, 10: 0.463,
    11: 0.412, 12: 0.415, 13: 0.498, 14: 0.521, 15: 0.326,
    16: 0.391, 17: 0.269, 18: 0.662, 19: 0.458, 20: 0.479,
    21: 0.491, 22: 0.483, 23: 0.494, 24: 0.382, 25: 0.166,
    26: 0.526, 27: 0.669, 28: 0.216,
}

# Table 3 – county splits (Cong2026).
# The report's 101 county pieces includes 2 zero-population pieces (footnote 3).
# Our assignment file covers only populated blocks, so those 2 pieces are absent
# and we expect 99 county pieces.
EXPECTED_COUNTY_SPLITS = 19
EXPECTED_COUNTY_PIECES = 101  # matches report exactly; county_pieces uses geometry, not just populated blocks

# Table 4 – partisan metrics (Cong2026, Democratic POV).
# Only elections present in the VTD data are listed.
# Each entry: election → dict of Dem-POV expected values.
#   dem_seats : integer number of Dem district wins
#   v_rep     : Republican two-party vote share statewide
#   disprop   : Dem seat share − Dem vote share   (= −Disprop_Rep from Table 4)
#   eg        : efficiency gap Dem POV             (= −OEG_Rep from Table 4)
#   mm        : mean-median Dem POV                (= −MM_Rep  from Table 4)
#   pb        : partisan bias Dem POV              (= −PB_Rep  from Table 4)
#
# Column mapping note: the VTD gpkg's ``ag_18`` column contains the 2018
# Attorney General race (ATG18 in the report, V_Rep≈53%), not the Agriculture
# Commissioner race (AGR18, V_Rep≈50%).  Likewise ``ag_22`` maps to ATG22.
# Expected values for those two elections are taken from ATG18/ATG22 rows.
EXPECTED_PARTISAN: dict[str, dict] = {
    "pres_16": {"dem_seats": 9, "v_rep": 0.5062, "disprop": -0.172, "eg": -0.194, "mm": -0.045, "pb": -0.179},
    "sen_16":  {"dem_seats": 6, "v_rep": 0.5398, "disprop": -0.246, "eg": -0.223, "mm": -0.017, "pb": -0.179},
    "gov_18":  {"dem_seats": 9, "v_rep": 0.5020, "disprop": -0.177, "eg": -0.212, "mm": -0.030, "pb": -0.179},
    "sen_18":  {"dem_seats": 9, "v_rep": 0.5007, "disprop": -0.178, "eg": -0.217, "mm": -0.031, "pb": -0.179},
    "ag_18":   {"dem_seats": 9, "v_rep": 0.5306, "disprop": -0.148, "eg": -0.157, "mm": -0.038, "pb": -0.179},
    "pres_20": {"dem_seats": 6, "v_rep": 0.5169, "disprop": -0.269, "eg": -0.271, "mm": -0.023, "pb": -0.214},
    "gov_22":  {"dem_seats": 4, "v_rep": 0.5977, "disprop": -0.259, "eg": -0.198, "mm": -0.029, "pb": -0.250},
    "sen_22":  {"dem_seats": 4, "v_rep": 0.5829, "disprop": -0.274, "eg": -0.227, "mm": -0.029, "pb": -0.286},
    "ag_22":   {"dem_seats": 4, "v_rep": 0.6059, "disprop": -0.251, "eg": -0.181, "mm": -0.032, "pb": -0.214},
}

COMPACT_TOLERANCE = 0.020   # ±2 pp for compactness scores
PARTISAN_TOLERANCE = 0.020  # ±2 pp for partisan metrics
VOTE_SHARE_TOLERANCE = 0.005  # ±0.5 pp for statewide vote shares


# ── module-scoped data loading ────────────────────────────────────────────────


@pytest.fixture(scope="module")
def fl_graph():
    """Load the combined block+VTD dual graph."""
    with open(GRAPH_PKL, "rb") as f:
        return pickle.load(f)


@pytest.fixture(scope="module")
def fl_assignments() -> list[list]:
    """Read the pre-computed hybrid assignment file (VTD + block level).
    """
    assignments: list[list] = []
    with open(HYBRID_ASSIGNMENT_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            geoid, district = line.split(",", 1)
            assignments.append([geoid, int(district)])
    return assignments


# ── module-scoped DB fixtures ─────────────────────────────────────────────────


@pytest.fixture(scope="module")
def fl_client(integration_engine):
    """Module-scoped test client backed by per-request sessions."""
    def _get_session():
        with Session(integration_engine, expire_on_commit=True) as s:
            yield s

    def _get_auth():
        return {"sub": ACCOUNT_AUTH0_ID}

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[auth.verify] = _get_auth
    with TestClient(app, headers={"origin": "http://localhost:5173"}) as client:
        yield client
    app.dependency_overrides.clear()


def _table_exists(engine, schema: str, table: str) -> bool:
    with Session(engine) as session:
        return bool(
            session.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = :schema AND table_name = :table"
                ),
                {"schema": schema, "table": table},
            ).scalar_one_or_none()
        )


def _view_exists(engine, schema: str, view: str) -> bool:
    """Return True if a regular view or materialized view with this name exists."""
    with Session(engine) as session:
        return bool(
            session.execute(
                text(
                    "SELECT 1 FROM information_schema.views "
                    "WHERE table_schema = :schema AND table_name = :view "
                    "UNION ALL "
                    "SELECT 1 FROM pg_matviews "
                    "WHERE schemaname = :schema AND matviewname = :view "
                    "LIMIT 1"
                ),
                {"schema": schema, "view": view},
            ).scalar_one_or_none()
        )


def _map_exists(engine, slug: str) -> str | None:
    """Return the map UUID if it exists, else None."""
    with Session(engine) as session:
        return session.execute(
            text("SELECT uuid FROM districtrmap WHERE districtr_map_slug = :slug"),
            {"slug": slug},
        ).scalar_one_or_none()

def _ogr2ogr_load(gpkg: Path, layer: str, table: str) -> None:
    subprocess.run(
        [
            "ogr2ogr",
            "-f", "PostgreSQL",
            INTEGRATION_OGR2OGR_PG_CONNECTION_STRING,
            str(gpkg),
            layer,
            "-lco", "OVERWRITE=yes",
            "-lco", "GEOMETRY_NAME=geometry",
            "-nln", f"{GERRY_DB_SCHEMA}.{table}",
            "-nlt", "MULTIPOLYGON",
        ],
        check=True,
        capture_output=True,
    )


@pytest.fixture(scope="module")
def fl_in_gerrydb(integration_engine):
    """Load FL parent (VTD) and child (block) layers into the test gerrydb schema.

    First checks whether the layers are already present (fast path for the persistent
    integration database).  If absent, runs ogr2ogr — slow (~10–30 minutes for the
    576 MB block file) but only needed once.
    """
    vtd_loaded = _table_exists(integration_engine, GERRY_DB_SCHEMA, FL_VTD_TABLE)
    block_loaded = _table_exists(integration_engine, GERRY_DB_SCHEMA, FL_BLOCK_TABLE)

    if vtd_loaded and block_loaded:
        return  # already set up from a previous run

    # First-time setup via ogr2ogr
    if not vtd_loaded:
        _ogr2ogr_load(VTD_GPKG, FL_VTD_TABLE, FL_VTD_TABLE)
    if not block_loaded:
        _ogr2ogr_load(BLOCK_GPKG, FL_BLOCK_TABLE, FL_BLOCK_TABLE)

    with Session(integration_engine) as session:
        for name in (FL_VTD_TABLE, FL_BLOCK_TABLE):
            session.execute(
                text(
                    "INSERT INTO gerrydbtable (uuid, name, updated_at) "
                    "VALUES (gen_random_uuid(), :name, now()) "
                    "ON CONFLICT (name) DO UPDATE SET updated_at = now()"
                ),
                {"name": name},
            )
        session.commit()


@pytest.fixture(scope="module")
def fl_view(integration_engine, fl_in_gerrydb):
    """Create the shatterable UNION ALL view combining VTDs and blocks.

    Guards against a stale ``gerrydbtable`` entry left by a previous crashed run
    where the stored procedure inserted the entry but the overall transaction was
    rolled back before the view was committed.
    """
    if _view_exists(integration_engine, GERRY_DB_SCHEMA, FL_VIEW_NAME):
        return
    # Remove any orphaned gerrydbtable entry so the stored procedure can insert cleanly.
    with Session(integration_engine) as session:
        session.execute(
            text("DELETE FROM public.gerrydbtable WHERE name = :name"),
            {"name": FL_VIEW_NAME},
        )
        session.commit()
    with Session(integration_engine) as session:
        create_shatterable_gerrydb_view(
            session,
            parent_layer=FL_VTD_TABLE,
            child_layer=FL_BLOCK_TABLE,
            gerrydb_table_name=FL_VIEW_NAME,
        )
        session.commit()


@pytest.fixture(scope="module")
def fl_map(integration_engine, fl_view) -> str:
    """Create the shatterable DistrictrMap and populate parent–child edges.

    Returns the map UUID.  Skipped if the map already exists.
    """
    existing_uuid = _map_exists(integration_engine, FL_MAP_SLUG)
    if existing_uuid:
        return existing_uuid

    with Session(integration_engine) as session:
        map_uuid = create_districtr_map(
            session,
            name="Florida Congressional 2026",
            districtr_map_slug=FL_MAP_SLUG,
            gerrydb_table_name=FL_VIEW_NAME,
            parent_layer=FL_VTD_TABLE,
            child_layer=FL_BLOCK_TABLE,
            num_districts=28,
        )
        session.commit()

    # Spatial join to build parent–child edges (PostGIS ST_Contains).
    # This is slow for 390 K blocks but only runs once per database.
    with Session(integration_engine) as session:
        create_parent_child_edges(session, map_uuid)
        session.commit()

    return map_uuid


def _count_document_assignments(engine, document_id: str) -> int:
    """Count rows in the per-document assignment partition table."""
    partition = f"document.assignments_{document_id}"
    with Session(engine) as session:
        try:
            return session.execute(
                text(f'SELECT COUNT(*) FROM public."{partition}"')
            ).scalar_one()
        except Exception:
            return 0


@pytest.fixture(scope="module")
def fl_document_id(integration_engine, fl_client, fl_map, fl_assignments) -> str:
    """Create a document and submit all Cong2026 assignments.

    If a document for this map already exists with a full assignment load it is
    reused.  A partially-loaded document (e.g. from a previous run that crashed
    mid-chunk) is deleted and recreated so stale results don't pollute the tests.
    """
    expected_count = len(fl_assignments)

    existing = fl_client.get(f"/api/document?districtr_map_slug={FL_MAP_SLUG}")
    if existing.status_code == 200 and existing.json():
        doc_id = existing.json()[0]["document_id"]
        if _count_document_assignments(integration_engine, doc_id) >= expected_count:
            return doc_id
        # Stale/partial document — purge it so we can start fresh.
        with Session(integration_engine) as session:
            session.execute(
                text("DELETE FROM document.district_unions WHERE document_id = :id"),
                {"id": doc_id},
            )
            session.execute(
                text("DELETE FROM document.document WHERE document_id = :id"),
                {"id": doc_id},
            )
            session.commit()

    resp = fl_client.post("/api/create_document", json={"districtr_map_slug": FL_MAP_SLUG})
    assert resp.status_code == 201, resp.text
    document_id = resp.json()["document_id"]

    resp = fl_client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": fl_assignments,
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert resp.status_code == 200, resp.text

    return document_id


@pytest.fixture(scope="module")
def fl_ctx(integration_engine, fl_document_id, fl_graph):
    """DocumentEvaluationContext for the FL Cong2026 document.

    ``get_graph`` is patched to serve the pre-loaded pickle so that
    graph-dependent metrics (cut_edges, contiguous) work without requiring
    the graph file to be placed under VOLUME_PATH.  This is a filesystem shim,
    not a database mock.
    """
    original = eval_graph_module.get_graph
    eval_graph_module.get_graph = lambda _name: fl_graph
    try:
        with Session(integration_engine, expire_on_commit=True) as session:
            ctx = DocumentEvaluationContext(
                background_tasks=BackgroundTasks(),
                session=session,
                document_id=fl_document_id,
            )
            # Warm the district_stats cache so all metric calls in this module
            # share the same PostGIS computation.
            _ = ctx.district_stats
            yield ctx
    finally:
        eval_graph_module.get_graph = original


# ── TestPopulationBalance ─────────────────────────────────────────────────────


class TestPopulationBalance:
    """Section 3.1: each of the 28 districts has 769 220 or 769 221 people."""

    def test_deviation_is_one_person(self, fl_ctx):
        result = population_deviation(fl_ctx)
        ideal = 21_538_187 // 28  # 769 220
        assert result["top_to_bottom_deviation"] == pytest.approx(1 / ideal, abs=1e-5)


# ── TestCompactness ───────────────────────────────────────────────────────────


class TestCompactness:
    """Tables 1 and 2: plan-average and per-district compactness scores."""

    def test_avg_polsby_popper(self, fl_ctx):
        pp = polsby_popper(fl_ctx)
        avg = sum(pp.values()) / len(pp)
        assert avg == pytest.approx(EXPECTED_AVG_PP, abs=COMPACT_TOLERANCE)

    def test_avg_reock(self, fl_ctx):
        r = reock(fl_ctx)
        avg = sum(r.values()) / len(r)
        assert avg == pytest.approx(EXPECTED_AVG_REOCK, abs=COMPACT_TOLERANCE)

    @pytest.mark.parametrize("district,expected_pp", EXPECTED_PP_BY_DISTRICT.items())
    def test_per_district_polsby_popper(self, fl_ctx, district, expected_pp):
        pp = polsby_popper(fl_ctx)
        assert pp[district] == pytest.approx(expected_pp, abs=COMPACT_TOLERANCE), (
            f"CD{district}: got {pp[district]:.3f}, expected {expected_pp:.3f}"
        )

    @pytest.mark.parametrize("district,expected_reock", EXPECTED_REOCK_BY_DISTRICT.items())
    def test_per_district_reock(self, fl_ctx, district, expected_reock):
        r = reock(fl_ctx)
        assert r[district] == pytest.approx(expected_reock, abs=COMPACT_TOLERANCE), (
            f"CD{district}: got {r[district]:.3f}, expected {expected_reock:.3f}"
        )

    def test_block_cut_edges(self, fl_ctx):
        """Table 1: block-level cut edges via the metric function (exact)."""
        result = block_cut_edges(fl_ctx)
        assert result["cut_count"] == EXPECTED_CUT_EDGES
        assert result["unit_type"] == "block"


# ── TestCountySplits ──────────────────────────────────────────────────────────


class TestCountySplits:
    """Table 3: county split and piece counts."""

    def test_county_split_count(self, fl_ctx):
        result = county_pieces(fl_ctx)
        split_counties = sum(
            1 for _forced, actual, _name in result.values() if actual >= 2
        )
        assert split_counties == EXPECTED_COUNTY_SPLITS

    def test_county_piece_count(self, fl_ctx):
        """County pieces from populated-block assignments only (99, not 101).

        The report counts 101 pieces including 2 zero-population pieces (footnote 3).
        Our assignment file covers only the 390 066 populated blocks, so those 2
        zero-population pieces are absent.
        """
        result = county_pieces(fl_ctx)
        total = sum(actual for _forced, actual, _name in result.values() if actual > 0)
        assert total == EXPECTED_COUNTY_PIECES

    def test_returns_all_fl_counties(self, fl_ctx):
        """All 67 FL counties must appear in the output."""
        result = county_pieces(fl_ctx)
        assert len(result) == 67


# ── TestPartisanMetrics ───────────────────────────────────────────────────────


class TestPartisanMetrics:
    """Table 4: partisan metrics for every election present in the VTD data.

    Sign convention throughout: Democratic POV (positive = Dem advantage).
    """

    @pytest.mark.parametrize("election,expected", EXPECTED_PARTISAN.items())
    def test_seat_counts(self, fl_ctx, election, expected):
        result = seats(fl_ctx)
        assert result[election]["dem"] == expected["dem_seats"], (
            f"{election}: dem seats {result[election]['dem']} ≠ {expected['dem_seats']}"
        )
        assert result[election]["rep"] == 28 - expected["dem_seats"]

    @pytest.mark.parametrize("election,expected", EXPECTED_PARTISAN.items())
    def test_republican_vote_share(self, fl_ctx, election, expected):
        result = vote_shares(fl_ctx)
        assert result[election]["rep"] == pytest.approx(
            expected["v_rep"], abs=VOTE_SHARE_TOLERANCE
        ), f"{election}: rep VS {result[election]['rep']:.4f} vs {expected['v_rep']:.4f}"

    @pytest.mark.parametrize("election,expected", EXPECTED_PARTISAN.items())
    def test_disproportionality(self, fl_ctx, election, expected):
        result = disproportionality(fl_ctx)
        assert result[election] == pytest.approx(expected["disprop"], abs=PARTISAN_TOLERANCE), (
            f"{election}: disproportionality {result[election]:.3f} vs {expected['disprop']:.3f}"
        )

    @pytest.mark.parametrize("election,expected", EXPECTED_PARTISAN.items())
    def test_efficiency_gap(self, fl_ctx, election, expected):
        result = efficiency_gap(fl_ctx)
        assert result[election] == pytest.approx(expected["eg"], abs=PARTISAN_TOLERANCE), (
            f"{election}: EG {result[election]:.3f} vs {expected['eg']:.3f}"
        )

    @pytest.mark.parametrize("election,expected", EXPECTED_PARTISAN.items())
    def test_mean_median(self, fl_ctx, election, expected):
        result = mean_median(fl_ctx)
        assert result[election] == pytest.approx(expected["mm"], abs=PARTISAN_TOLERANCE), (
            f"{election}: MM {result[election]:.3f} vs {expected['mm']:.3f}"
        )

    @pytest.mark.parametrize("election,expected", EXPECTED_PARTISAN.items())
    def test_partisan_bias(self, fl_ctx, election, expected):
        result = partisan_bias(fl_ctx)
        assert result[election] == pytest.approx(expected["pb"], abs=PARTISAN_TOLERANCE), (
            f"{election}: PB {result[election]:.3f} vs {expected['pb']:.3f}"
        )
