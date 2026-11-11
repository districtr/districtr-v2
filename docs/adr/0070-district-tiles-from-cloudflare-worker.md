# 70. District tiles served by a Cloudflare Worker, blocks loaded after the first shatter

Date: 2026-11-11 (PR #829)

## Status

Accepted. Amends [0008](0008-tiles-from-object-storage.md).

## Context

CloudFront cost about $234 a month against a budget of $10–15. It charges by bytes served, and district tilesets were 2,640 of the 3,368 GB it served from 2026-09-30 to 2026-10-30. A benchmark on 2026-11-11 found two sources of those bytes. A combined district tile is 88–96% block geometry, which the map draws only inside shattered parents. And reading one PMTiles archive by byte ranges defeats Chrome's cache: it re-sent overlapping ranges, up to 68% more bytes in one session.

[0008](0008-tiles-from-object-storage.md) records that tiles left Cloudflare R2 for S3 because a network blocked the bucket's `pub-….r2.dev` hostname (#130).

## Decision

District tilesets, the archives a map's `tiles_s3_path` names, are served by `tiles-worker/`: a Cloudflare Worker that reads the same PMTiles archives from an R2 bucket and answers one `z/x/y` URL per tile, behind Workers Cache. Cloudflare charges per request and nothing for bytes. The Worker's hostnames are under `districtr.org` (`1.tilesets.districtr.org` for production), reached through one CNAME each, with the shared `workers.dev` hostname off. The pipeline writes every district archive to S3 and to R2 under one key.

Every map with a child layer has a second archive holding its parent layer alone, at the combined archive's key ending in `.parent.pmtiles`. `BlockSource` starts the map's source on it and changes the source's URL to the combined archive once the Break tool is selected or the plan has a shattered parent. The source id, its layers and feature-state stay as they are.

Each stack turns the two on separately, through the repo variables `TILES_WORKER_URL_*` and `TILES_SPLIT_*`, which the app build bakes in. With both empty, the app reads PMTiles from the CDN as in 0008. The basemap, the county layer, Parquet and every other object stay on S3 and CloudFront.

## Alternatives considered

- **Two sources, one per layer.** Within 10% of the one-source switch in the benchmark, and it changes 75 references to the source id.
- **GeoJSON for the children of each shattered parent**, filtered by a Worker. The fewest bytes for a lightly shattered plan, at about 2.5 times the bytes per block of a tile and hundreds of MB of browser memory past roughly 10,000 shattered blocks.
- **A public R2 bucket read by byte ranges.** It needs the `r2.dev` hostname or DNS on Cloudflare, and keeps the range-request cache behavior.

## Consequences

The CDN bill falls to about $27 a month: roughly $6 for the Worker and $20 of CloudFront request charges for what stays there. In the benchmark's TX session on a home-connection profile, the Worker with the split took 58% less time and 62% fewer bytes than the CDN path (1.5 s and 4.2 MB against 3.7 s and 11.0 MB).

A map whose archive is missing from R2, or whose parent-only archive is missing, draws blank once its stack is switched over, so onboarding writes both stores and both archives (`run-map-onboarding`, step 3). Cloudflare and browsers cache a tile for a day, so a rebuilt tileset gets a new key. Selecting the Break tool downloads the block tiles in view, and a shatter keeps the map locked until they are there.

The tile settings are part of the frontend image tag, since a change to them needs a new build of the same commit. Clearing the variables returns a stack to the CDN path; the S3 archives stay in place for that.

## Revisit when

The basemap and county archives, about 29M requests a month, become the larger share of the CDN bill: the same Worker can serve them once their style files point at it. Or a network blocks the `districtr.org` tile hostnames.
