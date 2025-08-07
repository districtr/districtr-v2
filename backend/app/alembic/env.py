import os
import re
import dotenv
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
from app.alembic.constants import POST_GIS_ALPINE_RESERVED_TABLES
from app.core.models import SQLModel

from app.models import Document, MapDocumentUserSession, Assignments
from app.cms.models import TagsCMSContent, PlacesCMSContent
from app.save_share.models import MapDocumentToken
from app.comments.models import (
    Comment,
    Commenter,
    Tag,
    CommentTag,
    DocumentComment,
    CommentModeration,
    CommenterModeration,
    TagModeration,
)

dotenv.load_dotenv()

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# They're being missed for some reason because they're in other schemas. Quite annoying!
# Can't quite figure out how to get the models regognized properly in the SQLModel.metadata object
# so for now going with this workaround
tables = [
    Assignments,
    Document,
    MapDocumentUserSession,
    MapDocumentToken,
    PlacesCMSContent,
    TagsCMSContent,
    Comment,
    Commenter,
    Tag,
    CommentTag,
    DocumentComment,
    CommentModeration,
    CommenterModeration,
    TagModeration,
]

target_metadata = [SQLModel.metadata]
for table in tables:
    target_metadata.append(table.metadata)


def get_url():
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")
    server = os.getenv("POSTGRES_SERVER", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "app")
    return f"postgresql+psycopg://{user}:{password}@{server}:{port}/{db}"


def include_object(object, name, type_, reflected, compare_to):
    print(object, name, type_, reflected, compare_to)
    if hasattr(object, "schema") and object.schema == "gerrydb":
        return False

    if name and (
        name in POST_GIS_ALPINE_RESERVED_TABLES
        or re.match(r"document.assignments_.+", name)
        or re.match(r"parentchildedges_.+", name)
        or re.match(r".*_districtr_view+", name)
        # For whatever reason alembic fails to recognize it already exists
        or name == "document_geo_id_unique"
    ):
        return False
    return True


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        include_object=include_object,
        include_schemas=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section)
    url = get_url()
    print("URL", url)
    configuration["sqlalchemy.url"] = url
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
            include_schemas=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
