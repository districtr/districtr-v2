import click
# import subprocess
# from pathlib import Path
# from urllib.parse import urlparse


@click.group()
def cli():
    pass


@cli.command()
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file")
def import_gerrydb_view():
    print("Importing GerryDB view...")


if __name__ == "__main__":
    cli()
