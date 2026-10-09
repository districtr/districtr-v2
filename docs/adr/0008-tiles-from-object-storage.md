# 8. Tiles served from object storage via HTTP range requests

Date: 2024-10-21 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

Map tiles, including the basemap, needed a serving path that did not load the backend API. A protomaps-generated basemap was built as a single large PMTiles file (PR #71), and gerrydb layer tiles were already range-read the same way (PR #20). PR #132 (closing #130) moved the bucket from Cloudflare R2 to S3 because a network was blocking R2.

## Decision

Serve all tiles — including a self-hosted protomaps light basemap — from object storage/CDN via HTTP range requests, using the PMTiles format read directly in the browser. The backend does not serve tiles.

## Consequences

Tile serving scales independently of the API and adds no request load to the backend. The minimal and streets basemaps are self-hosted (originally uploaded to an R2 bucket, generated with the protomaps/basemaps toolchain) rather than depending on a third-party basemap provider; the satellite style is the exception and loads its tiles from MapTiler (`app/public/satellite-basemap-style.json`).
