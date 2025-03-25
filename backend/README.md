# Backend

## Running Locally

`uvicorn app.main:app --reload`

And if you want to exclude somewhat noisy changes in virtualenv:

`uvicorn app.main:app --reload --reload-exclude '.venv/**/*.py'`

## Shipping

Don't forget to update requirements in case you added a new package with `uv pip freeze | uv pip compile - -o requirements.txt`

If you haven't set up your venv see [here](./README.md#python-install).

### Build locally

- `docker build -t districtr .`
- `docker run --rm -i districtr`

### Deploy

Automatic using GHA [fly.yml](../.github/workflows/fly.yml).

Handy fly commands:

- `fly status`
- `fly machines start`
- `fly ssh console`

## Migrations

### Revisions

`alembic revision --autogenerate -m "{{ migration_name }}"`
Then make sure the migration is what you want.

`alembic upgrade head`

To do this on production, run `fly postgres connect -a {{ database-id }}` then the above commands.

### Downgrading

`alembic downgrade -1`

### Migrating UDFs

UDFs can be tricky to handle in down revisions.

When updating UDFs in a migration, previous UDF definitions should be stored in a new directory `sql/versions/{down_revision}`, unique to each migration.
This approach has three main benefits:

1. UDF down-revisions are supported.\*
1. A canonical version of the UDF is available in the `sql/` directory, which can be directly edited. This provides git tracking history for UDFs, which is nice.
1. The `sql/versions` directory can be excluded from IDE searches, reducing noise when searching the codebase.

\* Previous methods for supporting UDF down-revisions were quite onerous, requiring either: (1) copy-pasting the previous definition into the alembic migration module or (2) creating entirely new UDF `.sql` files with prefixes or suffixes in the file name, even though modifying an existing UDF. These were the previous approachs taken before `fa7d5c356d1f`.

### Misc

`alembic history`

## Development

- Try to maximize the use of url parameters for handling state in the frontend. On the backend, this means that practically we should add slugs or UUIDs to models if there might be a page associated with that concept.

### Developer set-up

1. `cp .env.dev .env`
1. Fill out the .env with your local postgres credentials. Follow section [Postgres set-up](./README.md#postgres-set-up) for more details on creating your local database.
1. Make sure you've set up your pre-commits with `pre-commit install` as documented [here](../README.md#python).

### Python install

Dependencies are managed with uv as noted in the root README. Follow set-up instructions [there](../README.md#python). Production is on python 3.12.2; a python version >=3.11 is required.

Set-up virtual environment and install dependencies:

1. `uv venv --python 3.12.2`
1. `source .venv/bin/activate` on UNIX machines or `venv\Scripts\activate` on Windows.
1. `uv pip install -r requirements.txt`

### Postgres set-up

[Install postgres](https://www.postgresql.org/download/) based on your OS.

1. `psql`
1. `CREATE DATABASE districtr;`
1. `\c districtr`
1. `\dt` should yield no tables / make sure db is empty.
1. `\q`
1. `alembic upgrade head`

If needed, create a user for yourself.

1. `psql`
1. `\c districtr`
1. `CREATE USER postgres WITH PASSWORD 'make up your own password';`

### Testing

`pytest --cov=.`

Or with full coverage report:

`coverage run --source=app -m pytest -v && coverage html && open htmlcov/index.html`

#### Database teardown

All unit tests are run against a test database `districtr_test`. You can override the test database name by setting the `POSTGRES_TEST_DB` environment variable.

By default, the test database is created and destroyed for each test run. If you want to persist the database, set the environment variable `TEARDOWN_TEST_DB` to one of `false`, `f`, `0`, `no`  e.g. `TEARDOWN_TEST_DB=false pytest`.

### Useful reference apps

- [full-stack-fastapi-template](https://github.com/tiangolo/full-stack-fastapi-template/tree/master)

## Backend CLI

Because all endpoints are public, we need to be careful about what we expose in the API.
As such, management commands are to be exclusively run using the CLI.

To see which commands are available, run `python cli.py --help`.
You can also inspect individual commands by running `python cli.py <command> --help`.

These commands are fairly atomic. In the future we can create more complex commands that chain these together
to simplify set-up but for now that's a pretty low priority / devex need.

### Adding a new Districtr Map

A Districtr Map can either be shatterable or unshatterable. Both require GerryDB views to be loaded.

#### Loading GerryDB views

Run:
```sh
python cli.py import-gerrydb-view \
    --layer layer_name_in_geopackage \
    --gpkg /path/to/geopackage.gpkg \
    --replace
```

If creating a shatterable map, you'll need to load at least two views.
Make sure that the second view, the "child" view can be shattered by the "parent" view–meaning the child
geometries nest within the parent geometries.

#### Creating an unshatterable map

1. Load the GerryDB view for the map. See above.
1. Create a Districtr Map by running:

```sh
python cli.py create-districtr-map \
    --name "My map name" \
    --gerrydb-table-name gerrydb_layer_name \
    --parent-layer-name gerrydb_layer_name \
    --tiles-s3-path path/to/my/tiles.pmtiles
```

**A few important notes on tilesets:**
- The `tiles-s3-path` should be the URL _path_ only, without the leading `/`. The scheme, subdomain, domain, TLD, and port (if any) are passed to the FE via the `NEXT_PUBLIC_S3_BUCKET_URL` environment variable.
- For more on tilesets, see [Tileset CLI](###tilesets-cli).

#### Creating a shatterable map

1. Load GerryDB parent layer. See above.
1. Load GerryDB child layer. See above.
1. Create shatterable `MATERIALIZED VIEW`, which is the union of the parent and child layers by running:

```sh
python cli.py create-shatterable-districtr-view \
    --gerrydb-table-name gerrydb_layer_name \
    --parent-layer-name gerrydb_parent_layer_name \
    --child-layer-name gerrydb_child_layer_name
```

**Note:** The `gerrydb-table-name` must be unique across all shatterable maps.

4. Create a shatterable Districtr Map by running:

```sh
python cli.py create-districtr-map \
    --name "My shatterable map name" \
    --gerrydb-table-name gerrydb_layer_name \
    --parent-layer-name gerrydb_parent_layer_name \
    --child-layer-name gerrydb_child_layer_name \
    --tiles-s3-path path/to/my/joined/tiles.pmtiles
```

5. Create parent child edges by running `python cli.py create-parent-child-edges --districtr-map gerrydb_layer_name`

You're done! (Assuming you also created your tilesets. See pipelines CLI for that.)

### Batch loading shatterable districtr maps

Repeating the steps above for numerous layers can be quite onerous. Enter: the batch load CLI command!

Example usage:

```bash
python cli.py batch-create-districtr-maps \
    --config-file management/configs/geopackages_vap_and_election.yaml \
    --data-dir /Users/raphaellaude/Downloads/geopackages_vap_and_election
```

Full options

```bash
$ python cli.py batch-create-districtr-maps --help
Usage: cli.py batch-create-districtr-maps [OPTIONS]

Options:
  -c, --config-file TEXT  Path to config file  [required]
  -d, --data-dir TEXT     Path to data directory where the geopackages are
                          located or will be downloaded to
  --skip-gerrydb-loads    Skip loading data into GerryDB
  --help                  Show this message and exit.
```

#### Batch load config

See examples in `backend/management/configs`. Here's a minimal example for one shatterable map:

```yaml
gerrydb_views:
  - gpkg: ak_block_all_vap_elec.gpkg
    table_name: ak_block_all_vap_elec
    layer: ak_block_all_vap_elec_graph
shatterable_views:
  - gerrydb_table_name: ak_all_vap_elec
    parent_layer: ak_vtd_all_vap_elec
    child_layer: ak_block_all_vap_elec
districtr_maps:
  - name: Alaska State Senate (20)
    num_districts: 20
    gerrydb_table_name: ak_all_vap_elec
    parent_layer: ak_vtd_all_vap_elec
    child_layer: ak_block_all_vap_elec
    tiles_s3_path: tilesets/ak_all_vap_elec.pmtiles
```

## Tileset CLI

In some of the Backend CLI commands, a tileset path must be provided.
These tilesets are not generated by the Backend CLI, but by the pipelines Simple ELT CLI.
These two CLIs are separate because generating tilesets is a resource-intensive process that is best done in a separate environment.
Separating dependencies also allows us to decouple tile generation fromt the backend, which has its pros/cons.

To see which commands are available, run `python cli.py --help`.
You can also inspect individual commands by running `python cli.py <command> --help`.

### Generating individual tilesets

Use the `create-gerrydb-tileset` command.

### Generating tilesets for shatterable Districtr Maps

Shatterable Districtr Maps send both the parent and child layers to the frontend in a single tileset.
You can create tilesets with multiple layers with the tippecannoe `tile-join` utility our our wrapped CLI command, `merge-gerrydb-tilesets`.

### Production tilesets

The following tilesets are available to the production environment:

```txt
aws s3 ls s3://districtr-v2-dev/tilesets/ --endpoint-url=https://de4ecd9d308a46631d2b677af1d480a0.r2.cloudflarestorage.com --profile=cloudflare
2024-08-08 17:01:39          0
2024-08-08 17:00:39   29505257 co_block_all_basic_pops.pmtiles
2024-08-08 15:49:48   36458896 co_block_p1_view.pmtiles
2024-08-08 16:56:02   29457733 co_block_p4_view.pmtiles
2024-09-21 19:33:26   38903491 co_p1_view.pmtiles
2024-08-08 16:40:45    3227745 co_vtd_all_basic_pops.pmtiles
2024-08-08 16:40:30    3218826 co_vtd_p1_view.pmtiles
2024-08-08 17:01:14    3213257 co_vtd_p4_view.pmtiles
2024-08-08 16:03:14    3836927 de_demo_view_census_blocks.pmtiles
2024-08-08 16:45:09     300671 de_demo_view_census_vtd.pmtiles
2024-08-08 15:58:44   42409135 ga_block_all_basic_pops.pmtiles
2024-08-08 16:10:31   42403512 ga_block_p1_view.pmtiles
2024-08-08 16:40:15   42322552 ga_block_p4_view.pmtiles
2024-08-08 17:00:58    4330016 ga_vtd_all_basic_pops.pmtiles
2024-08-08 16:10:50    4324852 ga_vtd_p1_view.pmtiles
2024-08-08 17:01:34    4319648 ga_vtd_p4_view.pmtiles
2024-08-08 16:45:05   20444228 ks_demo_view_census_blocks.pmtiles
2024-08-08 16:45:23    1583210 ks_demo_view_census_vtd.pmtiles
2024-08-08 16:52:11   49466105 pa_demo_view_census_blocks.pmtiles
2024-08-08 16:41:05    5445496 pa_demo_view_census_vtd.pmtiles
2024-08-08 16:56:52    5923235 ri_block_all_basic_pops.pmtiles
2024-08-08 16:41:30    5922335 ri_block_p1_view.pmtiles
2024-08-08 16:56:27    5905631 ri_block_p4_view.pmtiles
2024-08-08 17:01:39     308259 ri_vtd_all_basic_pops.pmtiles
2024-08-08 15:58:49     307905 ri_vtd_p1_view.pmtiles
2024-08-08 16:45:14     307582 ri_vtd_p4_view.pmtiles
```

Only `co_p1_view.pmtiles` is a shatterable tileset,
which has both `co_vtd_p1_view` and `co_block_p1_view` as separate layers.

For now, @raphaellaude is the only maintainer that can add tilesets to the production environment.
