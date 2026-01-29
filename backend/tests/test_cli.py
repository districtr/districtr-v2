from click.testing import CliRunner
from sqlalchemy import text
from sqlmodel import Session
from cli import cli


def test_create_overlay(session: Session):
    """Test creating an overlay via CLI"""
    runner = CliRunner()

    result = runner.invoke(
        cli,
        [
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
        ],
    )

    assert result.exit_code == 0, f"CLI command failed: {result.output}"

    # Verify overlay was created
    stmt = text(
        "SELECT overlay_id, name, description, data_type, layer_type, source FROM overlay WHERE name = :name"
    )
    result_row = session.execute(stmt, {"name": "Test Overlay"}).one_or_none()

    assert result_row is not None
    overlay_id, name, description, data_type, layer_type, source = result_row
    assert name == "Test Overlay"
    assert description == "Test description"
    assert data_type == "geojson"
    assert layer_type == "fill"
    assert source == "https://example.com/data.geojson"


def test_create_overlay_with_pmtiles(session: Session):
    """Test creating a pmtiles overlay via CLI"""
    runner = CliRunner()

    result = runner.invoke(
        cli,
        [
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
        ],
    )

    assert result.exit_code == 0, f"CLI command failed: {result.output}"

    # Verify overlay was created
    stmt = text(
        "SELECT overlay_id, name, data_type, layer_type, source, source_layer FROM overlay WHERE name = :name"
    )
    result_row = session.execute(stmt, {"name": "PMTiles Overlay"}).one_or_none()

    assert result_row is not None
    overlay_id, name, data_type, layer_type, source, source_layer = result_row
    assert name == "PMTiles Overlay"
    assert data_type == "pmtiles"
    assert layer_type == "line"
    assert source == "s3://bucket/data.pmtiles"
    assert source_layer == "counties"


def test_create_overlay_with_custom_style(session: Session):
    """Test creating an overlay with custom style via CLI"""
    runner = CliRunner()

    custom_style_json = '{"paint": {"fill-color": "#ff0000", "fill-opacity": 0.5}}'

    result = runner.invoke(
        cli,
        [
            "create-overlay",
            "--name",
            "Styled Overlay",
            "--data-type",
            "geojson",
            "--layer-type",
            "fill",
            "--custom-style",
            custom_style_json,
        ],
    )

    assert result.exit_code == 0, f"CLI command failed: {result.output}"

    # Verify overlay was created with custom style
    stmt = text("SELECT custom_style FROM overlay WHERE name = :name")
    result_row = session.execute(stmt, {"name": "Styled Overlay"}).one_or_none()

    assert result_row is not None
    custom_style = result_row[0]
    assert custom_style is not None
    assert custom_style.get("paint", {}).get("fill-color") == "#ff0000"
    assert custom_style.get("paint", {}).get("fill-opacity") == 0.5


def test_create_overlay_and_add_to_map(
    session: Session, ks_demo_view_census_blocks_districtrmap
):
    """Test creating an overlay and adding it to a map via CLI"""
    runner = CliRunner()

    result = runner.invoke(
        cli,
        [
            "create-overlay",
            "--name",
            "Map Overlay",
            "--data-type",
            "geojson",
            "--layer-type",
            "fill",
            "--districtr-map-slug",
            "ks_demo_view_census_blocks_summary_stats",
        ],
    )

    assert result.exit_code == 0, f"CLI command failed: {result.output}"

    # Verify overlay was created
    stmt = text("SELECT overlay_id FROM overlay WHERE name = :name")
    overlay_result = session.execute(stmt, {"name": "Map Overlay"}).one_or_none()
    assert overlay_result is not None
    overlay_id = overlay_result[0]

    # Verify overlay was added to map
    stmt = text("SELECT overlay_ids FROM districtrmap WHERE districtr_map_slug = :slug")
    map_result = session.execute(
        stmt, {"slug": "ks_demo_view_census_blocks_summary_stats"}
    ).one_or_none()
    assert map_result is not None
    overlay_ids = map_result[0]
    assert overlay_ids is not None
    assert str(overlay_id) in [str(oid) for oid in overlay_ids]


def test_update_overlay(session: Session):
    """Test updating an overlay via CLI"""
    runner = CliRunner()

    # First create an overlay
    create_result = runner.invoke(
        cli,
        [
            "create-overlay",
            "--name",
            "Original Overlay",
            "--description",
            "Original description",
            "--data-type",
            "geojson",
            "--layer-type",
            "fill",
        ],
    )
    assert create_result.exit_code == 0

    # Get the overlay ID
    stmt = text("SELECT overlay_id FROM overlay WHERE name = :name")
    overlay_result = session.execute(stmt, {"name": "Original Overlay"}).one_or_none()
    assert overlay_result is not None
    overlay_id = str(overlay_result[0])

    # Update the overlay
    update_result = runner.invoke(
        cli,
        [
            "update-overlay",
            "--overlay-id",
            overlay_id,
            "--name",
            "Updated Overlay",
            "--description",
            "Updated description",
            "--layer-type",
            "line",
        ],
    )

    assert update_result.exit_code == 0, f"CLI command failed: {update_result.output}"

    # Verify overlay was updated
    stmt = text(
        "SELECT name, description, layer_type FROM overlay WHERE overlay_id = :overlay_id"
    )
    result_row = session.execute(stmt, {"overlay_id": overlay_id}).one_or_none()

    assert result_row is not None
    name, description, layer_type = result_row
    assert name == "Updated Overlay"
    assert description == "Updated description"
    assert layer_type == "line"
