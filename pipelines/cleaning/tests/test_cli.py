import pytest
from click.testing import CliRunner
import geopandas as gpd
from shapely.geometry import Polygon
from cleaning.cli import cleaning
import os


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def sample_blocks_gpkg(tmp_path):
    """Create a sample blocks GeoPackage for testing."""
    # Create sample block geometries
    blocks = [
        {
            "path": "12345678901244",  # Block ID
            "geometry": Polygon([(0, 0), (0, 1), (1, 1), (1, 0)]),
            "population": 100,
        },
        {
            "path": "12345678901255",  # Block ID
            "geometry": Polygon([(0, 0), (0, 1), (1, 1), (1, 0)]),
            "population": 100,
        },
        {
            "path": "12345678901333",
            "geometry": Polygon([(1, 0), (1, 1), (2, 1), (2, 0)]),
            "population": 200,
        },
    ]

    gdf = gpd.GeoDataFrame(blocks, crs="EPSG:4326")
    gpkg_path = tmp_path / "blocks.gpkg"
    gdf.to_file(gpkg_path, driver="GPKG")
    return str(gpkg_path)


def test_aggregate_command_basic(runner, sample_blocks_gpkg, tmp_path):
    """Test basic aggregation functionality."""
    out_path = str(tmp_path / "output.gpkg")

    result = runner.invoke(
        cleaning,
        [
            "aggregate",
            "--blocks-gpkg",
            sample_blocks_gpkg,
            "--layer-name",
            "blocks",
            "--aggregate-to",
            "block-group",
            "--out-path",
            out_path,
        ],
    )

    assert result.exit_code == 0
    assert os.path.exists(out_path)

    # Verify the output
    gdf = gpd.read_file(out_path)
    assert len(gdf) == 2  # Should be aggregated to two block group
    assert "population" in gdf.columns
    id = "123456789012"
    assert gdf[gdf["path"].str.startswith(id)]["population"].sum() == 200
    assert gdf["population"].sum() == 400  # Sum of both blocks


def test_aggregate_command_with_edges(runner, sample_blocks_gpkg, tmp_path):
    """Test aggregation with graph edges."""
    out_path = str(tmp_path / "output.gpkg")

    result = runner.invoke(
        cleaning,
        [
            "aggregate",
            "--blocks-gpkg",
            sample_blocks_gpkg,
            "--layer-name",
            "blocks",
            "--aggregate-to",
            "block-group",
            "--build-edges",
            "--out-path",
            out_path,
        ],
    )

    assert result.exit_code == 0
    assert os.path.exists(out_path)

    # Verify the output and edges
    gdf = gpd.read_file(out_path)
    assert len(gdf) == 2

    # Check if edges layer exists
    edges = gpd.read_file(out_path, layer="gerrydb_graph_edge")
    assert len(edges) > 0
    assert all(col in edges.columns for col in ["path_1", "path_2", "weights"])


def test_aggregate_command_invalid_aggregation(runner, sample_blocks_gpkg, tmp_path):
    """Test aggregation with invalid aggregation level."""
    out_path = str(tmp_path / "output.gpkg")

    result = runner.invoke(
        cleaning,
        [
            "aggregate",
            "--blocks-gpkg",
            sample_blocks_gpkg,
            "--layer-name",
            "blocks",
            "--aggregate-to",
            "invalid-level",
            "--out-path",
            out_path,
        ],
    )

    assert result.exit_code != 0
    assert "Invalid value" in result.output


def test_aggregate_command_missing_required(runner):
    """Test aggregation with missing required parameters."""
    result = runner.invoke(
        cleaning,
        ["aggregate"],
    )

    assert result.exit_code != 0
    assert "Missing option" in result.output


def test_aggregate_command_with_upload(
    runner, sample_blocks_gpkg, tmp_path, monkeypatch
):
    """Test aggregation with S3 upload."""
    out_path = str(tmp_path / "output.gpkg")

    result = runner.invoke(
        cleaning,
        [
            "aggregate",
            "--blocks-gpkg",
            sample_blocks_gpkg,
            "--layer-name",
            "blocks",
            "--aggregate-to",
            "block-group",
            "--out-path",
            out_path,
            "--upload",
        ],
    )

    assert result.exit_code == 0
    assert os.path.exists(out_path)
