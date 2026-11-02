import click
from ensembles.cli import ensembles
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
cli.add_command(ensembles)

if __name__ == "__main__":
    cli()
