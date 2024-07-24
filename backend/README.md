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

Dependencies are managed with uv as noted in the root README. Follow set-up instructions [there](../README.md#python). Production is on python 3.12.2; a python version >=3.11 is required.

Set-up virtual environment and install dependencies:

1. `uv venv`
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

`pytest --cov=app --cov-report=html`

Or with full coverage report:

`coverage run --source=app -m pytest -v && coverage html && open htmlcov/index.html`

#### Database teardown

All unit tests are run against a test database `districtr_test`. You can override the test database name by setting the `POSTGRES_TEST_DB` environment variable.

By default, the test database is created and destroyed for each test run. If you want to persist the database, set the environment variable `TEARDOWN_TEST_DB` to one of `false`, `f`, `0`, `no`  e.g. `TEARDOWN_TEST_DB=false pytest`.

### Useful reference apps

- [full-stack-fastapi-template](https://github.com/tiangolo/full-stack-fastapi-template/tree/master)
