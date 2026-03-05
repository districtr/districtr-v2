# PIPELINES_EXPERT

## Purpose
Define conventions for data pipelines that produce artifacts consumed by backend and frontend (tilesets, tabular parquet, transforms).

## When To Use
- You are editing code in `pipelines/`.
- You are adding/changing CLI commands for tilesets/tabular/transforms.
- You are changing output artifact shape, storage keys, or generation toolchain.

## Canonical Files
- `pipelines/README.md`
- `pipelines/cli.py`
- `pipelines/tilesets/cli.py`
- `pipelines/tilesets/models.py`
- `pipelines/tabular/cli.py`
- `pipelines/tabular/models.py`
- `pipelines/transforms/cli.py`
- `pipelines/transforms/models.py`
- `pipelines/core/settings.py`

## Hard Invariants
- Artifact compatibility with FE/BE contracts is mandatory (tileset layers, parquet columns, paths).
- External binaries are required for certain flows (`ogr2ogr`, `tippecanoe`, duckdb spatial).
- CLI commands remain the canonical execution surface for pipeline tasks.
- S3/R2 key conventions must remain stable unless coordinated across consumers.

## Preferred Patterns
- Use typed config models and batch config files for repeatable runs.
- Keep heavy transforms in pipeline modules, not backend request paths.
- Validate outputs before upload and before consumer integration.
- Coordinate lifecycle changes with [GERRYDB_MAP_LIFECYCLE_EXPERT.md](./GERRYDB_MAP_LIFECYCLE_EXPERT.md).

## Anti-Patterns
- Changing output schema without verifying FE/BE ingestion assumptions.
- Hardcoding environment-specific paths in reusable pipeline code.
- Skipping required tool dependencies and expecting graceful behavior.
- Mixing experimental scratch scripts into canonical CLI flow without clear boundary.

## Change Checklist
1. Confirm dependency/toolchain requirements for changed command.
2. Confirm output naming/path conventions remain consumer-compatible.
3. Confirm batch config examples still represent valid workflows.
4. Validate upload behavior and credentials assumptions.
5. Smoke-test downstream consumption path (backend/FE) for changed artifacts.

## Validation Commands
- `docker-compose run pipelines sh -c "python cli.py --help"`
- `docker-compose run pipelines sh -c "python cli.py tileset --help"`
- `docker-compose run pipelines sh -c "python cli.py tabular --help"`
- `docker-compose run pipelines sh -c "python cli.py transforms --help"`

## Common Failure Modes
- Missing system dependencies causing runtime failures during conversion/tiling.
- Incorrect layer naming causing BE shatter/contiguity mismatches.
- Parquet output drift that breaks FE demography paths.
- Upload path mismatch making artifacts unavailable to runtime services.
