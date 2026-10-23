# 8. Tiles served from object storage via HTTP range requests

Date: 2024-10-21 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

Map tiles, including the basemap, needed a serving path that did not load the backend API. A protomaps-generated basemap was built as a single large PMTiles file (PR #71), and gerrydb layer tiles were already range-read the same way (PR #20). PR #132 (closing #130) moved the bucket from Cloudflare R2 to S3 because a network was blocking R2.

## Decision

Serve all tiles — including a self-hosted protomaps light basemap — from object storage/CDN via HTTP range requests, using the PMTiles format read directly in the browser. The backend does not serve tiles.

## Consequences

Tile serving scales independently of the API and adds no request load to the backend. The minimal and streets basemaps are self-hosted: both styles read the same PMTiles archive from the S3 bucket's CDN (`basemaps/20240325.pmtiles`), built with the protomaps/basemaps toolchain, rather than depending on a third-party basemap provider. The satellite style is the exception: its sources are MapTiler tile endpoints. Streets and satellite arrived together with PR #510. The three style JSONs are not in the repo: `app/scripts/fetch-basemap-styles.sh` downloads them from the bucket's `basemaps/` folder at build time, and `app/src/app/constants/map/viewDefaults.ts` holds their URLs, so which host a style's tiles come from is readable only in the fetched files.
