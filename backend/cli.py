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
    """
    Create collections in MongoDB if they do not exist, otherwise apply migrations.

    Args:
        collections (tuple[str]): Collection names.
            Pass multiple collection names with `python cli.py create-collections -c collection1 -c collection2`.
    """
    _create_collections(list(collections))


if __name__ == "__main__":
    cli()
