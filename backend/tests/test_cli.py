from app.models import DistrictrMap, DistrictrMapOverlays, Overlay
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
from sqlalchemy import select
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
