# tiles-worker

A Cloudflare Worker that serves district tilesets as `z/x/y` vector tiles from PMTiles archives in R2.
Cloudflare doesn't charge for bandwidth, and district tilesets are about 80% of the CloudFront bill
(2,640 of 3,368 GB from 2026-09-30 to 2026-10-30).

The paths mirror the S3 keys, so the app's source URL is `${NEXT_PUBLIC_TILES_WORKER_URL}/${tiles_s3_path}`:

| Path | Returns |
|---|---|
| `/tilesets/tx_districtr_view_v2.pmtiles` | TileJSON |
| `/tilesets/tx_districtr_view_v2.pmtiles/{z}/{x}/{y}.mvt` | A tile, gzipped exactly as stored (`Content-Encoding: gzip`), or 204 if empty |

Workers Cache (`cache` in `wrangler.jsonc`) answers repeat requests without running the Worker, on
`workers.dev`, without needing a Cloudflare-hosted domain. Every request is billed: $5/month covers 10M, then
$0.30 per million. Responses are cached for one day. The cache key includes the Worker version, so
`bun run deploy` also purges the cache, for example after a tileset is rebuilt in place.

## Local

```bash
bun install
bunx wrangler r2 object put districtr-tilesets/tilesets/wy_districtr_view_v2.pmtiles --local --file wy.pmtiles
bun run dev     # http://localhost:8787
bun run check   # tiles must match what pmtiles reads from the CDN
```

To try it in the app, set `NEXT_PUBLIC_TILES_WORKER_URL=http://localhost:8787` in `app/.env.local`. If it's
unset, the app reads PMTiles from the CDN as before.

## Deploy

1. Use a Cloudflare account on Workers Paid. At about 14M requests a month, the free plan's daily cap is too small.
2. Create the bucket: `bunx wrangler r2 bucket create districtr-tilesets`.
3. Copy the tilesets: `rclone copy s3:<tileset bucket>/tilesets r2:districtr-tilesets/tilesets`. That's a few GB,
   or under $1 of S3 egress.
4. Run `bun run deploy`, which prints `https://districtr-tiles.<account>.workers.dev`.
5. Pass `NEXT_PUBLIC_TILES_WORKER_URL=<that URL>` as a frontend build arg (`.github/workflows/deploy-app.yml`),
   starting with dev.

Not done yet: the tileset pipeline still uploads only to S3, so new or rebuilt tilesets need to be copied to R2 too.
