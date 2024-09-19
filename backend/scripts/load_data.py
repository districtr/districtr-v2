import subprocess
import sqlalchemy as sa
from os import environ
from glob import glob

# Optionally, set a data directory to load in
DATA_DIR = environ.get("GPKG_DATA_DIR", "sample_data")
# flag to load data, by default, will load data
LOAD_DATA = environ.get("LOAD_GERRY_DB_DATA", "true")


def update_tile_column(engine):
    """
    Update the 'tiles_s3_path' column in the 'gerrydbtable' of the public schema.

    This function connects to the database using the provided SQLAlchemy engine
    and executes an UPDATE query. It sets the 'tiles_s3_path' column to a
    concatenated string based on the 'name' column.

    Args:
        engine (sqlalchemy.engine.Engine): SQLAlchemy engine instance for database connection.

    Prints:
        Success message with the number of updated rows or an error message if the update fails.

    Raises:
        SQLAlchemyError: If there's an error during the database operation.
    """
    print("UPDATING GERRYDB COLUMN")
    with engine.connect() as connection:
        try:
            result = connection.execute(
                sa.text(
                    "UPDATE public.gerrydbtable SET tiles_s3_path = CONCAT('tilesets/', name, '.pmtiles')"
                )
            )
            updated_rows = result.rowcount
            print(f"Successfully updated {updated_rows} rows in gerrydbtable.")
            connection.commit()
        except sa.exc.SQLAlchemyError as e:
            print(f"Error updating gerrydbtable: {str(e)}")
            connection.rollback()


def load_sample_data():
    """
    Load sample data from the specified data directory.

    This function iterates through all files with a '.gpkg' extension in the
    specified data directory, and for each file, it runs a script to load the
    GerryDB view.

    Args:
      None
    Returns:
      None
    """
    for gpkg in glob(f"{DATA_DIR}/*.gpkg"):
        subprocess.run(["bash", "./scripts/load_gerrydb_view.sh", gpkg])


if __name__ == "__main__":
    if LOAD_DATA == "true":
        load_sample_data()
        engine = sa.create_engine(environ.get("DATABASE_URL"))
        update_tile_column(engine)
