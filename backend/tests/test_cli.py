import pytest
from app.models import DistrictrMap, Overlay
from sqlmodel import Session
from tests.constants import (
    POSTGRES_TEST_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_SERVER,
    POSTGRES_PORT,
    POSTGRES_SCHEME,
)
from pathlib import Path
import subprocess
import os
from sqlalchemy import select, text
from uuid import uuid4
import json

test_env = os.environ.copy()
test_env["POSTGRES_DB"] = POSTGRES_TEST_DB
test_env["POSTGRES_USER"] = POSTGRES_USER
test_env["POSTGRES_PASSWORD"] = POSTGRES_PASSWORD
test_env["POSTGRES_SERVER"] = POSTGRES_SERVER
test_env["POSTGRES_PORT"] = str(POSTGRES_PORT)
# Set DATABASE_URL to ensure the CLI uses the test database
test_env["DATABASE_URL"] = (
    f"{POSTGRES_SCHEME}://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_TEST_DB}"
)
backend_dir = Path(__file__).parent.parent


def cleanup_overlay(session: Session, overlay_name: str):
    stmt = select(Overlay).where(Overlay.name == overlay_name)
    (overlay,) = session.exec(stmt).one_or_none()
    if overlay:
        session.delete(overlay)
        session.commit()


def test_create_overlay(session: Session):
    """Test creating an overlay via CLI"""
    # Configure environment variables for test database
    # Construct arguments as would be passed to the CLI
    cli_args = [
        "python",
        "cli.py",
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
    ]

    # Run the CLI as a subprocess from the backend directory where cli.py is located
    result_proc = subprocess.run(
        cli_args,
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
    )

    assert (
        result_proc.returncode == 0
    ), f"CLI command failed: {result_proc.stderr or result_proc.stdout}"

    # Refresh the session to ensure we can see committed data from the subprocess
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
    cli_args = [
        "python",
        "cli.py",
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
    ]
    result_proc = subprocess.run(
        cli_args,
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
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

    cli_args = [
        "python",
        "cli.py",
        "create-overlay",
        "--name",
        "Styled Overlay",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
        "--custom-style",
        custom_style_json,
    ]
    result_proc = subprocess.run(
        cli_args,
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
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
    cli_args = [
        "python",
        "cli.py",
        "create-overlay",
        "--name",
        "Map Overlay",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
        "--districtr-map-slugs",
        "ks_demo_view_census_blocks_summary_stats",
    ]

    result_proc = subprocess.run(
        cli_args,
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
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
    cli_args = [
        "python",
        "cli.py",
        "create-overlay",
        "--name",
        "Original Overlay",
        "--description",
        "Original description",
        "--data-type",
        "geojson",
        "--layer-type",
        "fill",
    ]

    # First create an overlay
    create_result = subprocess.run(
        cli_args,
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
    )
    assert (
        create_result.returncode == 0
    ), f"CLI command failed: {create_result.stderr or create_result.stdout}"

    # Get the overlay ID
    original_overlay_stmt = select(Overlay).where(Overlay.name == "Original Overlay")
    (original_overlay,) = session.exec(original_overlay_stmt).one_or_none()
    assert original_overlay is not None, "Original overlay not found in database"
    original_overlay_id = str(original_overlay.overlay_id)

    update_cli_args = [
        "python",
        "cli.py",
        "update-overlay",
        "--overlay-id",
        original_overlay_id,
        "--name",
        "Updated Overlay",
    ]
    # Update the overlay
    update_result = subprocess.run(
        update_cli_args,
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
    )
    result_output = update_result.stderr or update_result.stdout
    assert (
        f"Updated overlay {original_overlay_id}" in result_output
    ), "Overlay not updated"
    cleanup_overlay(session, "Updated Overlay")


LINK_TEST_OVERLAY_NAME = "Link Overlays Test Overlay"
LINK_TEST_PARENT_LAYER = "link_overlays_test_layer"
LINK_TEST_MAP_SLUGS = ("link_overlays_test_map_ks", "link_overlays_test_map_mo")


def run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["python", "cli.py", *args],
        cwd=str(backend_dir),
        env=test_env,
        capture_output=True,
        text=True,
    )


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

    The CLI runs as a subprocess with its own database connection, so these
    rows must be committed with a real Session(engine) — the rollback-session
    fixture used elsewhere is invisible to subprocesses.
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
    """Create a committed overlay row visible to CLI subprocesses."""
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
