# Districtr Reboot

The Districtr reboot monorepo. Repo structure:

- [`app`](app/): The rebooted Districtr app, NextJS/React Typescript app
- [`backend`](backend/): Backend. TBD tech stack
- [`pipelines`](pipelines/): Data pipelines, ETL. Thinking of using Dagster.
- [`prototypes`](prototypes/): Prototypes conducted as part of the reboot.

## App

TK

## Backend

TK

## Pipelines

TK

## Prototypes

All prototypes, whether for services, APIs, frontend tests, etc. should be kept here. Each prototype should be in its own directory.

- `automerge-blocks`: Test using [automerge CRDT](https://automerge.org/) to manage documents / block-level assignments. **Status**: Won't pursue due to perf limitations.
- `deckgl-blocks`: Test using [DeckGL](https://deck.gl/) and [GeoParquets](https://observablehq.com/@kylebarron/geoarrow-and-geoparquet-in-deck-gl) for both rendering and metric calculation (thought the latter part has yet to be tested). **Status**: Still much to explore but decision is not to pursue for now while we go down the PMTiles route.
- `v1`: Previous work done to date by UChicago DSI team. **Status**: On hold.

Prototypes are documented in more detail [here](https://docs.google.com/document/d/1bx-mhIMPUxD8FxZRCbiz6zk3_TfdER7SBWO3Z_27EKc/edit).

## Developer set-up

Shared set-up / configuration across monorepo.

### Python

Dependencies are managed with [uv](https://github.com/astral-sh/uv). Follow their setup instructions [here](https://github.com/astral-sh/uv/blob/main/README.md).

This project is formatted with ruff using pre-commit hooks. Make sure [pre-commit](https://pre-commit.com/) and [ruff](https://pypi.org/project/ruff/) are intalled then run `pre-commit install` in the root directory.

Test that the pre-commit hooks are working by running `pre-commit run --all-files`.

## CI/CD

TBD but tests (and deploys?) should be run w/ GHAs.
