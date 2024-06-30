import click
from app.core.db import create_collections as _create_collections, get_mongo_database


@click.group()
def cli():
    pass


@cli.command("list-collections")
def list_collections():
    db = get_mongo_database()
    collections = db.list_collection_names()
    print(collections)


@cli.command("create-collections")
@click.option("--collections", "-c", help="Collection name", multiple=True)
def create_collections(collections: tuple[str]):
    _create_collections(list(collections))


if __name__ == "__main__":
    cli()
