# Backend

## Running Locally

`uvicorn app.main:app --reload`

And if you want to exclude somewhat noisy changes in virtualenv:

`uvicorn app.main:app --reload --reload-exclude '.venv/**/*.py'`

## Shipping

Don't forget to update requirements in case you added a new package with `uv pip freeze | uv pip compile - -o requirements.txt`

If you haven't set up your venv see [here](./README.md#python-install).

### Build locally

- `docker build -t {{ database-id }} .`
- `docker run --rm -i {{ database-id }}`

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

### Python install

1. `uv venv`
1. `source venv/bin/activate`
1. `uv pip install -r requirements.txt`

### Postgres set-up

TODO

### Testing

`pytest --cov=app --cov-report=html`

Or with full coverage report:

`coverage run --source=app -m pytest -v && coverage html && open htmlcov/index.html`

### MongoDB

#### MacOS

1. `brew tap mongodb/brew`

### Useful reference apps

- [full-stack-fastapi-template](https://github.com/tiangolo/full-stack-fastapi-template/tree/master)
