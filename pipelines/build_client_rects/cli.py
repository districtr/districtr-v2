import click
from utils import process_geodataframe
import geopandas as gpd


@click.group()
def cli():
    pass


@cli.command("build-client-rects")
@click.option("--layer", "-n", help="layer of the view", required=True)
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
@click.option(
    "--min-coverage", "-c", help="Minimum coverage of the geometry", default=0.85
)
@click.option(
    "--max-coverage-overlap",
    "-m",
    help="Maximum coverage overlap of the geometry",
    default=1.15,
)
@click.option(
    "--min-cell-coverage",
    "-C",
    help="Minimum cell coverage of the geometry",
    default=0.75,
)
@click.option("--output-json", "-j", help="Output JSON file", default=True)
@click.option("--output-gpkg", "-p", help="Output GeoPackage file", default=True)
@click.option("--outpath", "-o", help="Output path", default=None)
def build_client_rects(
    layer: str,
    gpkg: str,
    min_coverage: float,
    max_coverage_overlap: float,
    min_cell_coverage: float,
    output_json: bool,
    output_gpkg: bool,
    outpath: str,
):
    """Builds client rects from a GeoPackage file."""
    print("Building client rects...")
    gdf = gpd.read_file(gpkg, layer=layer)
    path_out = outpath if outpath else f"build_client_rects/output/{layer}"

    process_geodataframe(
        gdf,
        min_coverage=min_coverage,
        max_coverage_overlap=max_coverage_overlap,
        min_cell_coverage=min_cell_coverage,
        output_json=output_json,
        output_gpkg=output_gpkg,
        outpath=path_out,
    )


if __name__ == "__main__":
    cli()
