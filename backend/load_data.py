import subprocess
from os import environ, path
import json  # Assuming this import is needed for the JSON operations
import inspect
# TODO refactor to these utilities
# from app.utils import create_parent_child_edges, create_districtr_map, create_shatterable_gerrydb_view
from app.main import get_session
from sqlalchemy import text  # Add this import at the top of the file

# Optionally, set a data directory to load in
DATA_DIR = environ.get("GPKG_DATA_DIR", "sample_data")
# flag to load data, by default, will load data
LOAD_DATA = environ.get("LOAD_GERRY_DB_DATA", "false").lower() == 'true'


def load_sample_data(config):
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

    subprocess.run(["alembic", "upgrade", "head"])

    for view in config["gerrydb_views"]:
        subprocess.run(
            [
                "python3",
                "cli.py",
                "import-gerrydb-view",
                "--layer",
                view["layer"],
                "--gpkg",
                path.join(DATA_DIR, view["gpkg"]),
                "--replace",
            ]
        )

    for view in config["shatterable_views"]:
        session = next(get_session())
        exists_query = text(f"SELECT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = '{view['gerrydb_table_name']}')")
        result = session.execute(exists_query).scalar()
        if result:
            print(f"###\nMaterialized view {view['gerrydb_table_name']} already exists.\n###")
        else:
            subprocess.run(
                [
                    "python3",
                    "cli.py",
                    "create-shatterable-districtr-view",
                    "--gerrydb-table-name",
                    view["gerrydb_table_name"],
                    "--parent-layer-name",
                    view["parent_layer_name"],
                    "--child-layer-name",
                    view["child_layer_name"],
                ]
            )

    for view in config["districtr_map"]:
        session = next(get_session())
        name = view['name']
        exists_query = text(f"SELECT count(*) FROM public.districtrmap WHERE name = '{name}'")
        result = session.execute(exists_query).scalar()

        if result > 0:
            print(f"###\Districtr map {name} already exists.\n###")
        else:
            subprocess.run(
                [
                    "python3",
                    "cli.py",
                    "create-districtr-map",
                    "--name",
                    view["name"],
                    "--parent-layer-name",
                    view["parent_layer_name"],
                    "--child-layer-name",
                    view["child_layer_name"],
                    "--gerrydb-table-name",
                    view["gerrydb_table_name"],
                    "--tiles-s3-path",
                    view["tiles_s3_path"],
                ]
            )
            subprocess.run(
                [
                    "python3",
                    "cli.py",
                    "create-parent-child-edges",
                    "--districtr-map",
                    view["gerrydb_table_name"],
                ]
            )

if __name__ == "__main__":
    # Correctly open the config.json file and read its contents
    with open(path.join(DATA_DIR, "config.json")) as config_file:
        config = json.load(config_file)

    if LOAD_DATA:
        load_sample_data(config)
    else:
        print("App startup will not perform data loading.\nTo load, run `export LOAD_GERRY_DB_DATA='True' && python3 load_data.py`\nor change the environment variable in `docker-compose.yml`")
