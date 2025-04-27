# Pipelines

Where data processing/ELT that can happen outside the API should go. Currently all pipelines are run locally.
This project does not presently necessitate an orchestrator or cloud infra beyond object storage.
Most Input datasets come from the gerrydb project.

Structure:

- `core`: Shared configuration and models. No commands
- `tabular`: Demography and other tabular data handling.
- `tilesets`: CLI for creating tilesets consumed by Districtr v2.

## Quickstart

Using docker:

```sh
docker-compose run pipelines sh
```

From within the `pipelines` service, run commands:

```sh
python cli.py tileset create-gerrydb-tileset ...
python cli.py tabular build-parquet ...
```

## Installation

If running locally, create an environment and install deps:

```bash
uv venv
source .venv/bin/activate # for unix
uv pip install -r requirements.txt
```

To install the package in development mode run the following command from the pipelines directory:

```bash
pip install -e .
```

This will install the package in development mode, which means that any changes you make to the code will be immediately reflected in the installed package.

## Environment

The pipelines CLI requires access to S3 for many commands.

```bash
cp .env.example .env
```

And update the `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` env vars at a minimum.

All files created by the pipelines will be saved to `/tmp` by default. This can be overriden with the `OUT_SCRATCH` env var.

## Adding modules

You can add new modules by creating a click group in a new subdirectory and importing the click group to `./cli.py` and adding `cli.add_command(<my_new_module>)`. This will make your new command group's commands accessible as part of the larger CLI:

```bash
$ python cli.py --help
Usage: cli.py [OPTIONS] COMMAND [ARGS]...

  Main entry point for the districtr-v2 pipelines CLI.

Options:
  --help  Show this message and exit.

Commands:
  tabular  Tabular analysis commands.
  tileset  Tileset commands.
```
