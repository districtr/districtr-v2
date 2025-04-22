# Pipelines

Where data processing/ELT that can happen outside the API should go. Currently all pipelines are run locally.
This project does not presently necessitate an orchestrator or cloud infra beyond object storage.
Most Input datasets come from the gerrydb project.

Structure:

- `core`: Shared configuration and models
- `configs`: YAML configs for batch scripts
- `tilesets`: CLI for creating tilesets consumed by Districtr v2.
- `tabular`: Demography and other tabular data handling

## Quickstart

Using docker:

```sh
docker-compose run pipelines sh
```

From within the `pipelines` service, run commands:

```sh
python cli tilesets create-gerrydb-tileset ...
python cli tabular build-parquet ...
```
