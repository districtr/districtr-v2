import click
from tabular.cli import tabular
from tilesets.cli import tileset
from transforms.cli import transforms


@click.group()
def cli():
    """Main entry point for the districtr-v2 pipelines CLI."""
    pass


cli.add_command(tabular)
cli.add_command(tileset)
cli.add_command(transforms)

if __name__ == "__main__":
    cli()
