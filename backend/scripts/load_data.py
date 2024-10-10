import subprocess
from os import environ, path
import json  # Assuming this import is needed for the JSON operations
import inspect

currentdir = path.dirname(path.abspath(inspect.getfile(inspect.currentframe())))

# Optionally, set a data directory to load in
DATA_DIR = environ.get("GPKG_DATA_DIR", "sample_data")
# flag to load data, by default, will load data
LOAD_DATA = environ.get("LOAD_GERRY_DB_DATA", "true")


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

    subprocess.run(["alembic", "upgrade", "head"], cwd=path.join(currentdir, ".."))
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
            ],
            cwd=path.join(currentdir, ".."),
        )

    for view in config["shatterable_views"]:
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
            ],
            cwd=path.join(currentdir, ".."),
        )

    for view in config["districtr_map"]:
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
            ],
            cwd=path.join(currentdir, ".."),
        )

        subprocess.run(
            [
                "python3",
                "cli.py",
                "create-parent-child-edges",
                "--districtr-map",
                view["gerrydb_table_name"],
            ],
            cwd=path.join(currentdir, ".."),
        )  # Change working directory to parent


if __name__ == "__main__":
    # Correctly open the config.json file and read its contents
    with open(path.join(DATA_DIR, "config.json")) as config_file:
        config = json.load(config_file)

    if LOAD_DATA:
        load_sample_data(config)
