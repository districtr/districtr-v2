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

### Misc

`alembic history`

## Development

- Try to maximize the use of url parameters for handling state in the frontend. On the backend, this means that practically we should add slugs or UUIDs to models if there might be a page associated with that concept.

### Developer set-up

1. `cp .env.dev .env`
1. Fill out the .env with your local postgres credentials. Follow section [Postgres set-up](./README.md#postgres-set-up) for more details on creating your local database.
1. Make sure you've set up your pre-commits with `pre-commit install` as documented [here](../README.md#python).

### Python install

Dependencies are managed with uv as noted in the root README. Follow set-up instructions [there](../README.md#python).

Set-up virtual environment and install dependencies:

1. `uv venv`
1. `source venv/bin/activate` on UNIX machines or `venv\Scripts\activate` on Windows.
1. `uv pip install -r requirements.txt`

### Postgres set-up

[Install postgres](https://www.postgresql.org/download/) based on your OS.

1. `psql`
1. `CREATE DATABASE districtr;`
1. `\c districtr`
1. `\dt` should yield no tables / make sure db is empty.
1. `\q`
1. `alembic upgrade head`

### Testing

`pytest --cov=app --cov-report=html`

Or with full coverage report:

`coverage run --source=app -m pytest -v && coverage html && open htmlcov/index.html`

### MongoDB

#### MacOS

Follow [install instructions](https://github.com/mongodb/homebrew-brew).

#### Linux

See [Install MongoDB Community Edition on Linux](https://www.mongodb.com/docs/manual/administration/install-on-linux/)

#### Set-up test database

1. `brew services start mongodb-community` on Mac to start the server. TBD other platforms. Stop the server with `brew services stop mongodb-community`.
1. `mongosh`
1. `use districtr` to create a new database in `/usr/local/var/mongodb` (intel) or `/opt/homebrew/var/mongodb` (Apple silicon). Connects to the db if it already exists.

More info [here](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/).

Create collections:
1. `python cli.py create_collections`

Optionally you can create or update individual collections with `python cli.py create_collections -c {{ collection_name_1 }} -c {{ collection_name_2 }}`.

Confirm in `mongosh` with `use districtr` followed by `show collections` or `python cli.py list-collections`.

### Useful reference apps

- [full-stack-fastapi-template](https://github.com/tiangolo/full-stack-fastapi-template/tree/master)
