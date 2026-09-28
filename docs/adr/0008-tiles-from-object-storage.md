# 8. Tiles served from object storage via HTTP range requests

Date: 2024-10-21 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Map tiles, including the basemap, needed a serving path that did not load the backend API. A protomaps-generated basemap was built as a single large PMTiles file (PR #71), and vector tiles for gerrydb layers needed the same range-read serving model (PR #132, closing #130).

## Decision

Serve all tiles — including a self-hosted protomaps light basemap — from object storage/CDN via HTTP range requests, using the PMTiles format read directly in the browser. The backend does not serve tiles.

## Consequences

Tile serving scales independently of the API and adds no request load to the backend. The basemap is self-hosted (originally uploaded to an R2 bucket, generated with the protomaps/basemaps toolchain) rather than depending on a third-party basemap provider.
