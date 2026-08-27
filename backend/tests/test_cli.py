from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
import json

import cli
import pytest
from click.testing import CliRunner
from sqlmodel import Session
from sqlalchemy import select, text

from app.models import DistrictrMap, Overlay

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "gerrydb"


@pytest.fixture(autouse=True)
def _patch_cli_engine(engine, monkeypatch):
    """Point cli.py's module-level engine at the test database.

    cli.py's session_scope() resolves the name `engine` from its own module
    globals at call time, so patching it here redirects every CLI invocation
    below without touching cli.py itself.
    """
    monkeypatch.setattr(cli, "engine", engine)


def run_cli(*args: str) -> SimpleNamespace:
    """Invoke a cli.py command in-process via Click's CliRunner.

    Returns a subprocess.CompletedProcess-shaped object (returncode/stdout/
    stderr) so assertions below read the same as when this ran cli.py as a
    subprocess.
    """
    result = CliRunner().invoke(cli.cli, list(args))
    return SimpleNamespace(
        returncode=result.exit_code, stdout=result.output, stderr=result.output
    )


def cleanup_overlay(session: Session, overlay_name: str):
    stmt = select(Overlay).where(Overlay.name == overlay_name)
    (overlay,) = session.exec(stmt).one_or_none()
    if overlay:
        session.delete(overlay)
        session.commit()


def test_create_overlay(session: Session):
    """Test creating an overlay via CLI"""
    result_proc = run_cli(
        "create-overlay",
        "--name",
        "Test Overlay",
        "--description",
        "Test description",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
        "--source",
        "https://example.com/data.geojson",
    )

    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    # Refresh the session to ensure we can see committed data from the CLI call
    session.commit()

    # Verify overlay was created using session.exec() which returns model instances directly
    stmt = select(Overlay).where(Overlay.name == "Test Overlay")
    (overlay,) = session.exec(stmt).one_or_none()

    assert overlay is not None, "Overlay not found in database"
    assert overlay.name == "Test Overlay"
    assert overlay.description == "Test description"
    assert overlay.data_type == "geojson"
    assert overlay.layer_type == "fill"
    assert overlay.source == "https://example.com/data.geojson"
    cleanup_overlay(session, "Test Overlay")


def test_create_overlay_with_pmtiles(session: Session):
    """Test creating a pmtiles overlay via CLI"""
    result_proc = run_cli(
        "create-overlay",
        "--name",
        "PMTiles Overlay",
        "--data-type",
        "pmtiles",
        "--layer-type",
        "line",
        "--source",
        "s3://bucket/data.pmtiles",
        "--source-layer",
        "counties",
    )

    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    # Verify overlay was created
    stmt = select(Overlay).where(Overlay.name == "PMTiles Overlay")
    (overlay,) = session.exec(stmt).one_or_none()

    assert overlay is not None, "Overlay not found in database"
    assert overlay.name == "PMTiles Overlay"
    assert overlay.data_type == "pmtiles"
    assert overlay.layer_type == "line"
    assert overlay.source == "s3://bucket/data.pmtiles"
    assert overlay.source_layer == "counties"
    cleanup_overlay(session, "PMTiles Overlay")


def test_create_overlay_with_custom_style(session: Session):
    """Test creating an overlay with custom style via CLI"""
    custom_style_json = '{"paint": {"fill-color": "#ff0000", "fill-opacity": 0.5}}'

    result_proc = run_cli(
        "create-overlay",
        "--name",
        "Styled Overlay",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
        "--custom-style",
        custom_style_json,
    )

    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    # Verify overlay was created with custom style
    stmt = select(Overlay).where(Overlay.name == "Styled Overlay")
    (overlay,) = session.exec(stmt).one_or_none()

    assert overlay is not None, "Overlay not found in database"
    assert overlay.name == "Styled Overlay"
    assert overlay.data_type == "geojson"
    assert overlay.layer_type == "fill"
    assert overlay.custom_style == json.loads(custom_style_json)
    assert overlay.custom_style.get("paint", {}).get("fill-color") == "#ff0000"
    assert overlay.custom_style.get("paint", {}).get("fill-opacity") == 0.5
    cleanup_overlay(session, "Styled Overlay")


def test_create_overlay_and_add_to_map(
    session: Session, ks_demo_view_census_blocks_districtrmap
):
    """Test creating an overlay and adding it to a map via CLI"""
    result_proc = run_cli(
        "create-overlay",
        "--name",
        "Map Overlay",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
        "--districtr-map-slugs",
        "ks_demo_view_census_blocks_summary_stats",
    )

    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    # Verify overlay was created
    stmt = select(Overlay).where(Overlay.name == "Map Overlay")
    (overlay,) = session.exec(stmt).one_or_none()
    assert overlay is not None, "Overlay not found in database"
    assert overlay.name == "Map Overlay"
    assert overlay.data_type == "geojson"
    assert overlay.layer_type == "fill"

    # TODO: Verify overlay was added to map

    cleanup_overlay(session, "Map Overlay")


def test_update_overlay(session: Session):
    """Test updating an overlay via CLI"""
    # First create an overlay
    create_result = run_cli(
        "create-overlay",
        "--name",
        "Original Overlay",
        "--description",
        "Original description",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
    )
    assert (
        create_result.returncode == 0
    ), f"CLI command failed: {create_result.stderr or create_result.stdout}"

    # Get the overlay ID
    original_overlay_stmt = select(Overlay).where(Overlay.name == "Original Overlay")
    (original_overlay,) = session.exec(original_overlay_stmt).one_or_none()
    assert original_overlay is not None, "Original overlay not found in database"
    original_overlay_id = str(original_overlay.overlay_id)

    # Update the overlay
    update_result = run_cli(
        "update-overlay",
        "--overlay-id",
        original_overlay_id,
        "--name",
        "Updated Overlay",
    )
    assert (
        update_result.returncode == 0
    ), f"CLI command failed: {update_result.stderr or update_result.stdout}"

    # Query the DB directly rather than parsing log output: the CLI logs via
    # Python's logging module, which cli.py configures once at import time --
    # its handler holds a stale stderr reference under CliRunner's per-call
    # stdout/stderr swap, so log text isn't reliably present in result.output.
    updated_stmt = select(Overlay).where(
        Overlay.overlay_id == original_overlay.overlay_id
    )
    (updated_overlay,) = session.exec(updated_stmt).one_or_none()
    assert updated_overlay is not None, "Overlay not found after update"
    assert updated_overlay.name == "Updated Overlay"
    cleanup_overlay(session, "Updated Overlay")


LINK_TEST_OVERLAY_NAME = "Link Overlays Test Overlay"
LINK_TEST_PARENT_LAYER = "link_overlays_test_layer"
LINK_TEST_MAP_SLUGS = ("link_overlays_test_map_ks", "link_overlays_test_map_mo")


def purge_link_test_rows(session: Session):
    """Delete committed rows from the link-overlays tests, including leftovers from killed runs."""
    session.execute(
        text(
            """DELETE FROM districtrmap_overlays
            WHERE overlay_id IN (SELECT overlay_id FROM overlay WHERE name = :name)
            OR districtr_map_id IN (
                SELECT uuid FROM districtrmap WHERE districtr_map_slug = ANY(:slugs)
            )"""
        ),
        {"name": LINK_TEST_OVERLAY_NAME, "slugs": list(LINK_TEST_MAP_SLUGS)},
    )
    session.execute(
        text("DELETE FROM overlay WHERE name = :name"),
        {"name": LINK_TEST_OVERLAY_NAME},
    )
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = ANY(:slugs)"),
        {"slugs": list(LINK_TEST_MAP_SLUGS)},
    )
    session.commit()


@pytest.fixture(name="link_test_maps")
def link_test_maps_fixture(engine):
    """Two committed districtrmap rows (statefps ['20'] and ['29']).

    Committed with a real Session(engine) -- the rollback-session fixture
    used elsewhere is invisible outside its own transaction, and the CLI
    (in-process via CliRunner, but on its own DB session per call) needs
    these rows actually committed to see them.
    """
    with Session(engine) as setup_session:
        purge_link_test_rows(setup_session)
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET
                    updated_at = now()"""
            ),
            {"name": LINK_TEST_PARENT_LAYER},
        )
        map_uuids: dict[str, str] = {}
        for statefp, districtr_map_slug in zip(("20", "29"), LINK_TEST_MAP_SLUGS):
            districtr_map = DistrictrMap(
                uuid=str(uuid4()),
                name=f"Link overlays test map {statefp}",
                districtr_map_slug=districtr_map_slug,
                parent_layer=LINK_TEST_PARENT_LAYER,
                visible=True,
                map_type="default",
                num_districts_modifiable=True,
                statefps=[statefp],
            )
            setup_session.add(districtr_map)
            map_uuids[statefp] = districtr_map.uuid
        setup_session.commit()

    yield map_uuids

    with Session(engine) as teardown_session:
        purge_link_test_rows(teardown_session)


def create_link_test_overlay(engine, source: str | None = None) -> str:
    """Create a committed overlay row."""
    overlay_id = str(uuid4())
    with Session(engine) as overlay_session:
        overlay_session.add(
            Overlay(
                overlay_id=overlay_id,
                name=LINK_TEST_OVERLAY_NAME,
                data_type="geojson",
                layer_type="fill",
                source=source,
            )
        )
        overlay_session.commit()
    return overlay_id


def get_linked_map_ids(engine, overlay_id: str) -> set[str]:
    with Session(engine) as query_session:
        rows = query_session.execute(
            text(
                "SELECT districtr_map_id FROM districtrmap_overlays WHERE overlay_id = :overlay_id"
            ),
            {"overlay_id": overlay_id},
        ).all()
    return {str(row.districtr_map_id) for row in rows}


def test_link_overlays_to_maps_by_name(engine, link_test_maps):
    """Linking by --overlay-name links the overlay to all maps"""
    overlay_id = create_link_test_overlay(engine)

    result_proc = run_cli(
        "link-overlays-to-maps", "--overlay-name", LINK_TEST_OVERLAY_NAME
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    linked_map_ids = get_linked_map_ids(engine, overlay_id)
    assert link_test_maps["20"] in linked_map_ids, "Overlay not linked to KS map"
    assert link_test_maps["29"] in linked_map_ids, "Overlay not linked to MO map"


def test_link_overlays_to_maps_statefps_filter(engine, link_test_maps):
    """--statefps only links to maps whose statefps array overlaps the filter"""
    overlay_id = create_link_test_overlay(engine)

    result_proc = run_cli(
        "link-overlays-to-maps",
        "--overlay-name",
        LINK_TEST_OVERLAY_NAME,
        "--statefps",
        "20",
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    linked_map_ids = get_linked_map_ids(engine, overlay_id)
    assert link_test_maps["20"] in linked_map_ids, "Overlay not linked to KS map"
    assert (
        link_test_maps["29"] not in linked_map_ids
    ), "Overlay linked to MO map despite statefps filter"


def test_link_overlays_to_maps_by_source(engine, link_test_maps):
    """--overlay-source selects only the overlay rows with that exact source"""
    ks_overlay_id = create_link_test_overlay(
        engine, source="s3://bucket/link-test-ks.geojson"
    )
    mo_overlay_id = create_link_test_overlay(
        engine, source="s3://bucket/link-test-mo.geojson"
    )

    result_proc = run_cli(
        "link-overlays-to-maps",
        "--overlay-source",
        "s3://bucket/link-test-ks.geojson",
        "--statefps",
        "20",
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    ks_linked_map_ids = get_linked_map_ids(engine, ks_overlay_id)
    assert (
        link_test_maps["20"] in ks_linked_map_ids
    ), "Source-selected overlay not linked to KS map"
    assert (
        link_test_maps["29"] not in ks_linked_map_ids
    ), "Source-selected overlay linked to MO map despite statefps filter"
    assert (
        get_linked_map_ids(engine, mo_overlay_id) == set()
    ), "Overlay with a different source was linked"


def test_link_overlays_to_maps_idempotent(engine, link_test_maps):
    """Running the command twice leaves the junction table unchanged"""
    overlay_id = create_link_test_overlay(engine)

    first_proc = run_cli(
        "link-overlays-to-maps", "--overlay-name", LINK_TEST_OVERLAY_NAME
    )
    assert (
        first_proc.returncode == 0
    ), f"CLI command failed: {first_proc.stderr or first_proc.stdout}"
    first_linked_map_ids = get_linked_map_ids(engine, overlay_id)

    second_proc = run_cli(
        "link-overlays-to-maps", "--overlay-name", LINK_TEST_OVERLAY_NAME
    )
    assert (
        second_proc.returncode == 0
    ), f"CLI command failed: {second_proc.stderr or second_proc.stdout}"
    second_linked_map_ids = get_linked_map_ids(engine, overlay_id)

    assert (
        second_linked_map_ids == first_linked_map_ids
    ), "Second run changed the junction table"


def test_link_overlays_to_maps_invalid_selectors(engine, link_test_maps):
    """Unknown name/source/id, invalid UUID, and missing selectors all fail"""
    unknown_name_proc = run_cli(
        "link-overlays-to-maps", "--overlay-name", "No Such Overlay Name"
    )
    assert unknown_name_proc.returncode != 0, "Unknown overlay name did not fail"

    unknown_source_proc = run_cli(
        "link-overlays-to-maps",
        "--overlay-source",
        "s3://bucket/no-such-source.geojson",
    )
    assert unknown_source_proc.returncode != 0, "Unknown overlay source did not fail"

    invalid_uuid_proc = run_cli("link-overlays-to-maps", "--overlay-id", "not-a-uuid")
    assert invalid_uuid_proc.returncode != 0, "Invalid UUID format did not fail"

    unknown_uuid_proc = run_cli("link-overlays-to-maps", "--overlay-id", str(uuid4()))
    assert unknown_uuid_proc.returncode != 0, "Unknown overlay UUID did not fail"

    no_selector_proc = run_cli("link-overlays-to-maps")
    assert no_selector_proc.returncode != 0, "Missing selectors did not fail"


SYNC_TEST_SOURCE = "https://x/overlays/al_cd.geojson"
SYNC_TEST_STALE_NAME = "Sync Metadata Test Stale Name"
SYNC_TEST_STALE_DESCRIPTION = "Stale description"
SYNC_TEST_NEW_NAME = "Congressional Districts"
SYNC_TEST_NEW_DESCRIPTION = "Used in 2026 elections"
SYNC_TEST_ABSENT_SOURCE = "https://x/overlays/zz_none.geojson"


def purge_sync_test_rows(session: Session):
    """Delete committed overlays created by the sync-overlay-metadata tests."""
    session.execute(
        text("DELETE FROM overlay WHERE source = ANY(:sources)"),
        {"sources": [SYNC_TEST_SOURCE, SYNC_TEST_ABSENT_SOURCE]},
    )
    session.commit()


def create_sync_test_overlay(
    engine,
    layer_type: str,
    source: str,
    name: str = SYNC_TEST_STALE_NAME,
    description: str = SYNC_TEST_STALE_DESCRIPTION,
) -> str:
    """Create a committed overlay row."""
    overlay_id = str(uuid4())
    with Session(engine) as overlay_session:
        overlay_session.add(
            Overlay(
                overlay_id=overlay_id,
                name=name,
                description=description,
                data_type="geojson",
                layer_type=layer_type,
                source=source,
            )
        )
        overlay_session.commit()
    return overlay_id


def get_overlay_name_description(engine, overlay_id: str) -> tuple[str, str]:
    with Session(engine) as query_session:
        row = query_session.execute(
            text(
                "SELECT name, description FROM overlay WHERE overlay_id = :overlay_id"
            ),
            {"overlay_id": overlay_id},
        ).one()
    return row.name, row.description


@pytest.fixture(name="sync_test_cleanup")
def sync_test_cleanup_fixture(engine):
    """Purge sync-overlay-metadata test overlays before and after each test."""
    with Session(engine) as setup_session:
        purge_sync_test_rows(setup_session)
    yield
    with Session(engine) as teardown_session:
        purge_sync_test_rows(teardown_session)


def test_sync_overlay_metadata_updates_all_matching(
    engine, tmp_path, sync_test_cleanup
):
    """Both overlays sharing a source key get the new name and description"""
    line_overlay_id = create_sync_test_overlay(engine, "line", SYNC_TEST_SOURCE)
    text_overlay_id = create_sync_test_overlay(engine, "text", SYNC_TEST_SOURCE)

    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "al_cd": {
                    "name": SYNC_TEST_NEW_NAME,
                    "description": SYNC_TEST_NEW_DESCRIPTION,
                    "source": "Dave's Redistricting App",
                    "plan_name": "AL 2026 Congressional",
                    "year": "2026",
                }
            }
        )
    )

    result_proc = run_cli("sync-overlay-metadata", "--metadata", str(metadata_path))
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    for overlay_id in (line_overlay_id, text_overlay_id):
        name, description = get_overlay_name_description(engine, overlay_id)
        assert name == SYNC_TEST_NEW_NAME, "Overlay name not updated"
        assert (
            description == SYNC_TEST_NEW_DESCRIPTION
        ), "Overlay description not updated"


def test_sync_overlay_metadata_dry_run_no_changes(engine, tmp_path, sync_test_cleanup):
    """--dry-run leaves the overlay name and description unchanged"""
    overlay_id = create_sync_test_overlay(engine, "line", SYNC_TEST_SOURCE)

    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "al_cd": {
                    "name": SYNC_TEST_NEW_NAME,
                    "description": SYNC_TEST_NEW_DESCRIPTION,
                }
            }
        )
    )

    result_proc = run_cli(
        "sync-overlay-metadata", "--metadata", str(metadata_path), "--dry-run"
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    name, description = get_overlay_name_description(engine, overlay_id)
    assert name == SYNC_TEST_STALE_NAME, "Dry run changed overlay name"
    assert (
        description == SYNC_TEST_STALE_DESCRIPTION
    ), "Dry run changed overlay description"


def test_sync_overlay_metadata_absent_key_unchanged(
    engine, tmp_path, sync_test_cleanup
):
    """An overlay whose key is absent from the metadata is left unchanged"""
    overlay_id = create_sync_test_overlay(engine, "line", SYNC_TEST_ABSENT_SOURCE)

    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "al_cd": {
                    "name": SYNC_TEST_NEW_NAME,
                    "description": SYNC_TEST_NEW_DESCRIPTION,
                }
            }
        )
    )

    result_proc = run_cli("sync-overlay-metadata", "--metadata", str(metadata_path))
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    name, description = get_overlay_name_description(engine, overlay_id)
    assert name == SYNC_TEST_STALE_NAME, "Absent-key overlay name changed"
    assert (
        description == SYNC_TEST_STALE_DESCRIPTION
    ), "Absent-key overlay description changed"


def test_sync_overlay_metadata_missing_file_fails(engine, tmp_path):
    """A nonexistent metadata file exits non-zero"""
    missing_path = tmp_path / "does_not_exist.json"
    result_proc = run_cli("sync-overlay-metadata", "--metadata", str(missing_path))
    assert result_proc.returncode != 0, "Nonexistent metadata file did not fail"


# ---------------------------------------------------------------------------
# add-overlay-to-map / remove-overlay-from-map / delete-overlay
# ---------------------------------------------------------------------------

ADD_OVERLAY_TEST_OVERLAY_NAME = "Add Overlay To Map Test Overlay"
ADD_OVERLAY_TEST_MAP_SLUG = "cli_add_overlay_to_map_test_map"
ADD_OVERLAY_TEST_PARENT_LAYER = "cli_add_overlay_to_map_test_layer"


def purge_add_overlay_test_rows(session: Session):
    session.execute(
        text(
            """DELETE FROM districtrmap_overlays
            WHERE overlay_id IN (SELECT overlay_id FROM overlay WHERE name = :name)
            OR districtr_map_id IN (
                SELECT uuid FROM districtrmap WHERE districtr_map_slug = :slug
            )"""
        ),
        {"name": ADD_OVERLAY_TEST_OVERLAY_NAME, "slug": ADD_OVERLAY_TEST_MAP_SLUG},
    )
    session.execute(
        text("DELETE FROM overlay WHERE name = :name"),
        {"name": ADD_OVERLAY_TEST_OVERLAY_NAME},
    )
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = :slug"),
        {"slug": ADD_OVERLAY_TEST_MAP_SLUG},
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": ADD_OVERLAY_TEST_PARENT_LAYER},
    )
    session.commit()


@pytest.fixture(name="add_overlay_test_setup")
def add_overlay_test_setup_fixture(engine):
    """A committed Overlay + DistrictrMap, unlinked."""
    with Session(engine) as setup_session:
        purge_add_overlay_test_rows(setup_session)
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET updated_at = now()"""
            ),
            {"name": ADD_OVERLAY_TEST_PARENT_LAYER},
        )
        map_uuid = str(uuid4())
        setup_session.add(
            DistrictrMap(
                uuid=map_uuid,
                name="Add overlay to map test map",
                districtr_map_slug=ADD_OVERLAY_TEST_MAP_SLUG,
                parent_layer=ADD_OVERLAY_TEST_PARENT_LAYER,
                visible=True,
                map_type="default",
                num_districts_modifiable=True,
            )
        )
        overlay_id = str(uuid4())
        setup_session.add(
            Overlay(
                overlay_id=overlay_id,
                name=ADD_OVERLAY_TEST_OVERLAY_NAME,
                data_type="geojson",
                layer_type="fill",
            )
        )
        setup_session.commit()

    yield {"map_uuid": map_uuid, "overlay_id": overlay_id}

    with Session(engine) as teardown_session:
        purge_add_overlay_test_rows(teardown_session)


def test_add_overlay_to_map(engine, add_overlay_test_setup):
    """add-overlay-to-map inserts a districtrmap_overlays row"""
    result_proc = run_cli(
        "add-overlay-to-map",
        "--districtr-map-slug",
        ADD_OVERLAY_TEST_MAP_SLUG,
        "--overlay-id",
        add_overlay_test_setup["overlay_id"],
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    linked_map_ids = get_linked_map_ids(engine, add_overlay_test_setup["overlay_id"])
    assert add_overlay_test_setup["map_uuid"] in linked_map_ids


def test_remove_overlay_from_map(engine, add_overlay_test_setup):
    """remove-overlay-from-map deletes an existing districtrmap_overlays row"""
    with Session(engine) as link_session:
        link_session.execute(
            text(
                """INSERT INTO districtrmap_overlays (districtr_map_id, overlay_id)
                VALUES (:map_uuid, :overlay_id)"""
            ),
            {
                "map_uuid": add_overlay_test_setup["map_uuid"],
                "overlay_id": add_overlay_test_setup["overlay_id"],
            },
        )
        link_session.commit()

    result_proc = run_cli(
        "remove-overlay-from-map",
        "--districtr-map-slug",
        ADD_OVERLAY_TEST_MAP_SLUG,
        "--overlay-id",
        add_overlay_test_setup["overlay_id"],
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    linked_map_ids = get_linked_map_ids(engine, add_overlay_test_setup["overlay_id"])
    assert add_overlay_test_setup["map_uuid"] not in linked_map_ids


def test_delete_overlay(engine, add_overlay_test_setup):
    """delete-overlay removes the overlay and cascades to the junction table"""
    with Session(engine) as link_session:
        link_session.execute(
            text(
                """INSERT INTO districtrmap_overlays (districtr_map_id, overlay_id)
                VALUES (:map_uuid, :overlay_id)"""
            ),
            {
                "map_uuid": add_overlay_test_setup["map_uuid"],
                "overlay_id": add_overlay_test_setup["overlay_id"],
            },
        )
        link_session.commit()

    result_proc = run_cli(
        "delete-overlay", "--overlay-id", add_overlay_test_setup["overlay_id"]
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        overlay_row = query_session.execute(
            text("SELECT 1 FROM overlay WHERE overlay_id = :overlay_id"),
            {"overlay_id": add_overlay_test_setup["overlay_id"]},
        ).one_or_none()
        junction_row = query_session.execute(
            text("SELECT 1 FROM districtrmap_overlays WHERE overlay_id = :overlay_id"),
            {"overlay_id": add_overlay_test_setup["overlay_id"]},
        ).one_or_none()

    assert overlay_row is None, "Overlay row was not deleted"
    assert junction_row is None, "Junction row was not cascade-deleted"


# ---------------------------------------------------------------------------
# create-group / add-districtr-map-to-map-group
# ---------------------------------------------------------------------------

CREATE_GROUP_TEST_NAME = "CLI Test Group"
CREATE_GROUP_TEST_SLUG = "clitestgroup"


def purge_create_group_test_rows(session: Session):
    session.execute(
        text("DELETE FROM map_group WHERE slug = :slug"),
        {"slug": CREATE_GROUP_TEST_SLUG},
    )
    session.commit()


@pytest.fixture(name="create_group_test_cleanup")
def create_group_test_cleanup_fixture(engine):
    with Session(engine) as setup_session:
        purge_create_group_test_rows(setup_session)
    yield
    with Session(engine) as teardown_session:
        purge_create_group_test_rows(teardown_session)


def test_create_group_auto_slug(engine, create_group_test_cleanup):
    """create-group without --map-group-slug slugifies the name to lowercase a-z"""
    result_proc = run_cli("create-group", "--name", CREATE_GROUP_TEST_NAME)
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        row = query_session.execute(
            text("SELECT name, slug FROM map_group WHERE slug = :slug"),
            {"slug": CREATE_GROUP_TEST_SLUG},
        ).one_or_none()

    assert row is not None, "Map group not found"
    assert row.name == CREATE_GROUP_TEST_NAME
    assert row.slug == CREATE_GROUP_TEST_SLUG


ADD_MAP_TO_GROUP_TEST_MAP_SLUG = "cli_add_map_to_group_test_map"
ADD_MAP_TO_GROUP_TEST_PARENT_LAYER = "cli_add_map_to_group_test_layer"
ADD_MAP_TO_GROUP_TEST_GROUP_SLUGS = (
    "cli_add_map_to_group_test_group_one",
    "cli_add_map_to_group_test_group_two",
)


def purge_add_map_to_group_test_rows(session: Session):
    session.execute(
        text(
            """DELETE FROM districtrmaps_to_groups
            WHERE districtrmap_uuid IN (
                SELECT uuid FROM districtrmap WHERE districtr_map_slug = :slug
            )
            OR group_slug = ANY(:group_slugs)"""
        ),
        {
            "slug": ADD_MAP_TO_GROUP_TEST_MAP_SLUG,
            "group_slugs": list(ADD_MAP_TO_GROUP_TEST_GROUP_SLUGS),
        },
    )
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = :slug"),
        {"slug": ADD_MAP_TO_GROUP_TEST_MAP_SLUG},
    )
    session.execute(
        text("DELETE FROM map_group WHERE slug = ANY(:group_slugs)"),
        {"group_slugs": list(ADD_MAP_TO_GROUP_TEST_GROUP_SLUGS)},
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": ADD_MAP_TO_GROUP_TEST_PARENT_LAYER},
    )
    session.commit()


@pytest.fixture(name="add_map_to_group_test_setup")
def add_map_to_group_test_setup_fixture(engine):
    with Session(engine) as setup_session:
        purge_add_map_to_group_test_rows(setup_session)
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET updated_at = now()"""
            ),
            {"name": ADD_MAP_TO_GROUP_TEST_PARENT_LAYER},
        )
        map_uuid = str(uuid4())
        setup_session.add(
            DistrictrMap(
                uuid=map_uuid,
                name="Add map to group test map",
                districtr_map_slug=ADD_MAP_TO_GROUP_TEST_MAP_SLUG,
                parent_layer=ADD_MAP_TO_GROUP_TEST_PARENT_LAYER,
                visible=True,
                map_type="default",
                num_districts_modifiable=True,
            )
        )
        for group_slug in ADD_MAP_TO_GROUP_TEST_GROUP_SLUGS:
            setup_session.execute(
                text("INSERT INTO map_group (name, slug) VALUES (:name, :slug)"),
                {"name": group_slug, "slug": group_slug},
            )
        setup_session.commit()

    yield map_uuid

    with Session(engine) as teardown_session:
        purge_add_map_to_group_test_rows(teardown_session)


def group_membership_count(engine, map_uuid: str) -> int:
    with Session(engine) as query_session:
        return query_session.execute(
            text(
                "SELECT count(*) FROM districtrmaps_to_groups WHERE districtrmap_uuid = :map_uuid"
            ),
            {"map_uuid": map_uuid},
        ).scalar_one()


def test_add_districtr_map_to_map_group(engine, add_map_to_group_test_setup):
    """add-districtr-map-to-map-group adds fresh memberships and no-ops when already a member"""
    map_uuid = add_map_to_group_test_setup
    group_one, group_two = ADD_MAP_TO_GROUP_TEST_GROUP_SLUGS

    first_proc = run_cli(
        "add-districtr-map-to-map-group",
        "--districtr-map-slug",
        ADD_MAP_TO_GROUP_TEST_MAP_SLUG,
        "--map-group-slug",
        group_one,
    )
    assert (
        first_proc.returncode == 0
    ), f"CLI command failed: {first_proc.stderr or first_proc.stdout}"
    assert group_membership_count(engine, map_uuid) == 1

    # Already-in-group re-run is a no-op, not an error
    second_proc = run_cli(
        "add-districtr-map-to-map-group",
        "--districtr-map-slug",
        ADD_MAP_TO_GROUP_TEST_MAP_SLUG,
        "--map-group-slug",
        group_one,
    )
    assert (
        second_proc.returncode == 0
    ), f"CLI command failed: {second_proc.stderr or second_proc.stdout}"
    assert group_membership_count(engine, map_uuid) == 1

    third_proc = run_cli(
        "add-districtr-map-to-map-group",
        "--districtr-map-slug",
        ADD_MAP_TO_GROUP_TEST_MAP_SLUG,
        "--map-group-slug",
        group_two,
    )
    assert (
        third_proc.returncode == 0
    ), f"CLI command failed: {third_proc.stderr or third_proc.stdout}"
    assert group_membership_count(engine, map_uuid) == 2


# ---------------------------------------------------------------------------
# create-spatial-index
# ---------------------------------------------------------------------------


def test_create_spatial_index(engine, simple_parent_geos_gerrydb):
    """create-spatial-index creates a GIST index on the given gerrydb table"""
    result_proc = run_cli("create-spatial-index", "--table-name", "simple_parent_geos")
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        # ogr2ogr already creates its own GIST index on import, so this command's
        # index is expected to be the second one -- assert presence, not uniqueness.
        index_rows = query_session.execute(
            text(
                """SELECT indexdef FROM pg_indexes
                WHERE schemaname = 'gerrydb' AND tablename = 'simple_parent_geos'
                AND indexdef ILIKE '%USING gist%'"""
            )
        ).all()

    assert len(index_rows) > 0, "GIST spatial index was not created"


# ---------------------------------------------------------------------------
# add-extent-to-districtr-map
# ---------------------------------------------------------------------------

ADD_EXTENT_TEST_MAP_SLUG = "cli_add_extent_test_map"
ADD_EXTENT_TEST_PARENT_LAYER = "cli_add_extent_test_layer"


def purge_add_extent_test_rows(session: Session):
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = :slug"),
        {"slug": ADD_EXTENT_TEST_MAP_SLUG},
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": ADD_EXTENT_TEST_PARENT_LAYER},
    )
    session.commit()


@pytest.fixture(name="add_extent_test_setup")
def add_extent_test_setup_fixture(engine):
    with Session(engine) as setup_session:
        purge_add_extent_test_rows(setup_session)
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET updated_at = now()"""
            ),
            {"name": ADD_EXTENT_TEST_PARENT_LAYER},
        )
        setup_session.add(
            DistrictrMap(
                uuid=str(uuid4()),
                name="Add extent test map",
                districtr_map_slug=ADD_EXTENT_TEST_MAP_SLUG,
                parent_layer=ADD_EXTENT_TEST_PARENT_LAYER,
                visible=True,
                map_type="default",
                num_districts_modifiable=True,
            )
        )
        setup_session.commit()

    yield

    with Session(engine) as teardown_session:
        purge_add_extent_test_rows(teardown_session)


def test_add_extent_to_districtr_map_manual_bounds(engine, add_extent_test_setup):
    """--bounds sets DistrictrMap.extent to the given values without needing real geometry"""
    result_proc = run_cli(
        "add-extent-to-districtr-map",
        "--districtr-map-slug",
        ADD_EXTENT_TEST_MAP_SLUG,
        "--bounds",
        "-100.0",
        "30.0",
        "-90.0",
        "40.0",
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        extent = query_session.execute(
            text("SELECT extent FROM districtrmap WHERE districtr_map_slug = :slug"),
            {"slug": ADD_EXTENT_TEST_MAP_SLUG},
        ).scalar_one()

    assert extent == [-100.0, 30.0, -90.0, 40.0]


# ---------------------------------------------------------------------------
# batch-create-districtr-maps
# ---------------------------------------------------------------------------

BATCH_CREATE_TEST_MAP_SLUG = "cli_batch_create_test_map"


def purge_batch_create_test_rows(session: Session):
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = :slug"),
        {"slug": BATCH_CREATE_TEST_MAP_SLUG},
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": "simple_parent_geos"},
    )
    session.commit()


@pytest.fixture(name="batch_create_test_cleanup")
def batch_create_test_cleanup_fixture(engine):
    with Session(engine) as setup_session:
        purge_batch_create_test_rows(setup_session)
    yield
    with Session(engine) as teardown_session:
        purge_batch_create_test_rows(teardown_session)


def test_batch_create_districtr_maps(
    engine, tmp_path, simple_parent_geos, batch_create_test_cleanup
):
    """batch-create-districtr-maps with --skip-gerrydb-loads creates the configured map
    against the already-imported gerrydb table"""
    # simple_parent_geos (ogr2ogr only) rather than simple_parent_geos_gerrydb: the
    # latter's gerrydbtable insert rides the rollback-session transaction and holds a
    # row lock the CLI's own real commit below would deadlock against.
    with Session(engine) as setup_session:
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET updated_at = now()"""
            ),
            {"name": "simple_parent_geos"},
        )
        setup_session.commit()

    config_path = tmp_path / "batch_config.yaml"
    config_path.write_text(
        f"""
districtr_maps:
  - name: "Batch Create Test Map"
    districtr_map_slug: "{BATCH_CREATE_TEST_MAP_SLUG}"
    gerrydb_table_name: "simple_parent_geos"
    parent_layer: "simple_parent_geos"
"""
    )

    result_proc = run_cli(
        "batch-create-districtr-maps",
        "--config-file",
        str(config_path),
        "--skip-gerrydb-loads",
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        row = query_session.execute(
            text(
                """SELECT parent_layer, child_layer FROM districtrmap
                WHERE districtr_map_slug = :slug"""
            ),
            {"slug": BATCH_CREATE_TEST_MAP_SLUG},
        ).one_or_none()

    assert row is not None, "Districtr map was not created"
    assert row.parent_layer == "simple_parent_geos"
    assert row.child_layer is None


# ---------------------------------------------------------------------------
# import-gerrydb-view
# ---------------------------------------------------------------------------

IMPORT_GERRYDB_VIEW_LAYER = "ks_ellis_county_vap_data_vtd"


def purge_import_gerrydb_view_test_rows(session: Session):
    session.execute(text("DROP TABLE IF EXISTS gerrydb.ks_ellis_county_vap_data_vtd"))
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": IMPORT_GERRYDB_VIEW_LAYER},
    )
    session.commit()


@pytest.fixture(name="import_gerrydb_view_test_cleanup")
def import_gerrydb_view_test_cleanup_fixture(engine):
    with Session(engine) as setup_session:
        purge_import_gerrydb_view_test_rows(setup_session)
    yield
    with Session(engine) as teardown_session:
        purge_import_gerrydb_view_test_rows(teardown_session)


def test_import_gerrydb_view(engine, import_gerrydb_view_test_cleanup):
    """import-gerrydb-view loads the gpkg fixture into gerrydb.<layer> and upserts
    the gerrydbtable catalog row"""
    gpkg_path = FIXTURES_DIR / "ks_ellis_county_vtd.gpkg"

    result_proc = run_cli(
        "import-gerrydb-view",
        "--layer",
        IMPORT_GERRYDB_VIEW_LAYER,
        "--gpkg",
        str(gpkg_path),
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        table_row = query_session.execute(
            text("SELECT 1 FROM gerrydb.ks_ellis_county_vap_data_vtd LIMIT 1")
        ).one_or_none()
        catalog_row = query_session.execute(
            text("SELECT 1 FROM gerrydbtable WHERE name = :name"),
            {"name": IMPORT_GERRYDB_VIEW_LAYER},
        ).one_or_none()

    assert table_row is not None, "gerrydb.ks_ellis_county_vap_data_vtd was not created"
    assert catalog_row is not None, "gerrydbtable row was not upserted"


# ---------------------------------------------------------------------------
# create-districtr-map / update-districtr-map
# ---------------------------------------------------------------------------

CREATE_MAP_TEST_SLUG = "cli_create_districtr_map_test_map"


def purge_create_map_test_rows(session: Session):
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = :slug"),
        {"slug": CREATE_MAP_TEST_SLUG},
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": "simple_parent_geos"},
    )
    session.commit()


@pytest.fixture(name="create_map_test_cleanup")
def create_map_test_cleanup_fixture(engine):
    with Session(engine) as setup_session:
        purge_create_map_test_rows(setup_session)
    yield
    with Session(engine) as teardown_session:
        purge_create_map_test_rows(teardown_session)


def test_create_districtr_map(engine, simple_parent_geos, create_map_test_cleanup):
    """create-districtr-map creates the row and infers parent_geo_unit_type from
    the gerrydb layer's path column"""
    # simple_parent_geos (ogr2ogr only) rather than simple_parent_geos_gerrydb: the
    # latter's gerrydbtable insert rides the rollback-session transaction and holds a
    # row lock the CLI's own real commit below would deadlock against.
    with Session(engine) as setup_session:
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET updated_at = now()"""
            ),
            {"name": "simple_parent_geos"},
        )
        setup_session.commit()

    result_proc = run_cli(
        "create-districtr-map",
        "--name",
        "CLI Create Districtr Map Test",
        "--parent-layer-name",
        "simple_parent_geos",
        "--districtr-map-slug",
        CREATE_MAP_TEST_SLUG,
        "--gerrydb-table-name",
        "simple_parent_geos",
        "--no-extent",
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        row = query_session.execute(
            text(
                """SELECT parent_geo_unit_type FROM districtrmap
                WHERE districtr_map_slug = :slug"""
            ),
            {"slug": CREATE_MAP_TEST_SLUG},
        ).one_or_none()

    assert row is not None, "Districtr map was not created"
    assert row.parent_geo_unit_type == "vtd"


UPDATE_MAP_TEST_SLUG = "cli_update_districtr_map_test_map"
UPDATE_MAP_TEST_PARENT_LAYER = "cli_update_districtr_map_test_layer"


def purge_update_map_test_rows(session: Session):
    session.execute(
        text("DELETE FROM districtrmap WHERE districtr_map_slug = :slug"),
        {"slug": UPDATE_MAP_TEST_SLUG},
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": UPDATE_MAP_TEST_PARENT_LAYER},
    )
    session.commit()


@pytest.fixture(name="update_map_test_setup")
def update_map_test_setup_fixture(engine):
    with Session(engine) as setup_session:
        purge_update_map_test_rows(setup_session)
        setup_session.execute(
            text(
                """INSERT INTO gerrydbtable (uuid, name, updated_at)
                VALUES (gen_random_uuid(), :name, now())
                ON CONFLICT (name)
                DO UPDATE SET updated_at = now()"""
            ),
            {"name": UPDATE_MAP_TEST_PARENT_LAYER},
        )
        setup_session.add(
            DistrictrMap(
                uuid=str(uuid4()),
                name="Update districtr map test map",
                districtr_map_slug=UPDATE_MAP_TEST_SLUG,
                gerrydb_table_name=UPDATE_MAP_TEST_PARENT_LAYER,
                parent_layer=UPDATE_MAP_TEST_PARENT_LAYER,
                visible=True,
                map_type="default",
                num_districts_modifiable=True,
                comment="Original comment",
            )
        )
        setup_session.commit()

    yield

    with Session(engine) as teardown_session:
        purge_update_map_test_rows(teardown_session)


def test_update_districtr_map(engine, update_map_test_setup):
    """update-districtr-map updates the requested field on the existing row"""
    result_proc = run_cli(
        "update-districtr-map",
        "--districtr-map-slug",
        UPDATE_MAP_TEST_SLUG,
        "--gerrydb-table-name",
        UPDATE_MAP_TEST_PARENT_LAYER,
        "--comment",
        "Updated comment",
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        comment = query_session.execute(
            text("SELECT comment FROM districtrmap WHERE districtr_map_slug = :slug"),
            {"slug": UPDATE_MAP_TEST_SLUG},
        ).scalar_one()

    assert comment == "Updated comment"


# ---------------------------------------------------------------------------
# create-shatterable-districtr-view
# ---------------------------------------------------------------------------

SHATTERABLE_VIEW_TEST_TABLE_NAME = "cli_shatterable_view_test_table"


def purge_shatterable_view_test_rows(session: Session):
    session.execute(
        text(
            f"DROP MATERIALIZED VIEW IF EXISTS gerrydb.{SHATTERABLE_VIEW_TEST_TABLE_NAME}"
        )
    )
    session.execute(
        text("DELETE FROM gerrydbtable WHERE name = :name"),
        {"name": SHATTERABLE_VIEW_TEST_TABLE_NAME},
    )
    session.commit()


@pytest.fixture(name="shatterable_view_test_cleanup")
def shatterable_view_test_cleanup_fixture(engine):
    with Session(engine) as setup_session:
        purge_shatterable_view_test_rows(setup_session)
    yield
    with Session(engine) as teardown_session:
        purge_shatterable_view_test_rows(teardown_session)


def test_create_shatterable_districtr_view(
    engine,
    simple_parent_geos,
    simple_child_geos,
    shatterable_view_test_cleanup,
):
    """create-shatterable-districtr-view creates the materialized view and the
    gerrydbtable catalog row for it"""
    # simple_parent_geos/simple_child_geos (ogr2ogr only): the underlying stored
    # procedure operates on the real gerrydb.<table> geometry tables directly, so no
    # gerrydbtable catalog row is needed for the parent/child layer names here -- and
    # the _gerrydb fixture variants would add one that rides the rollback-session
    # transaction, an unnecessary lock this test doesn't need to risk.
    result_proc = run_cli(
        "create-shatterable-districtr-view",
        "--parent-layer-name",
        "simple_parent_geos",
        "--child-layer-name",
        "simple_child_geos",
        "--gerrydb-table-name",
        SHATTERABLE_VIEW_TEST_TABLE_NAME,
    )
    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    with Session(engine) as query_session:
        matview_row = query_session.execute(
            text(
                """SELECT 1 FROM pg_matviews
                WHERE schemaname = 'gerrydb' AND matviewname = :name"""
            ),
            {"name": SHATTERABLE_VIEW_TEST_TABLE_NAME},
        ).one_or_none()
        catalog_row = query_session.execute(
            text("SELECT 1 FROM gerrydbtable WHERE name = :name"),
            {"name": SHATTERABLE_VIEW_TEST_TABLE_NAME},
        ).one_or_none()

    assert matview_row is not None, "Materialized view was not created"
    assert catalog_row is not None, "gerrydbtable row was not created"
