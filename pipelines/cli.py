import click
from tabular.cli import tabular
from tilesets.cli import tileset


@click.group()
def cli():
    """Main entry point for the districtr-v2 pipelines CLI."""
    pass


cli.add_command(tabular)
cli.add_command(tileset)

if __name__ == "__main__":
    cli()
