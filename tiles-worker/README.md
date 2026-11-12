# tiles-worker

A Cloudflare Worker that serves district tilesets as `z/x/y` vector tiles from PMTiles archives in R2. Cloudflare doesn't charge for bandwidth, and district tilesets are about 80% of CloudFront's bytes (2,640 of 3,368 GB from 2026-09-30 to 2026-10-30). Moving them cuts the CDN bill from about $234 to about $27 a month: roughly $6 for the Worker and $20 for what stays on CloudFront.

The paths mirror the S3 keys, so the app's source URL is `${NEXT_PUBLIC_TILES_WORKER_URL}/${tiles_s3_path}`:

| Path | Returns |
|---|---|
| `/tilesets/tx_districtr_view_v2.pmtiles` | TileJSON (uncached, and without `vector_layers`) |
| `/tilesets/tx_districtr_view_v2.pmtiles/{z}/{x}/{y}.mvt` | A tile, gzipped exactly as stored (`Content-Encoding: gzip`), or 204 if empty |
| `/tilesets/tx_districtr_view_v2.parent.pmtiles` and its tiles | The same for the map's [parent-only archive](#parent-only-archives) |

Anything else gets a 404, including query strings and non-GET requests, since Workers Cache would skip them and every one would read R2.

## Parent-only archives

A combined tile is about 90% block geometry, and the map draws blocks only inside shattered parents. So every map with a child layer has a second archive beside the combined one, holding the parent layer alone, under the same key ending in `.parent.pmtiles` (`parentTilesPath` in the app).

With `NEXT_PUBLIC_TILES_SPLIT=true`, the map's source starts on the parent-only archive. It switches to the combined archive when the Break tool is selected, or when a plan opens with shattered parents, and stays there. The switch changes the source's URL in place, so the layers and feature-state carry over. A shatter keeps the map locked until the combined tiles are in view, so its blocks are there when the lock lifts (`utils/map/blockTiles.ts`).

The child layers stay on the source the whole time. MapLibre reports an error for each style layer whose source-layer the TileJSON's `vector_layers` leaves out, so the Worker's TileJSON omits the list.

## Caching and cost guard

Workers Cache (`cache` in `wrangler.jsonc`) answers repeat requests without running the Worker. Every request is billed, cached or not: $5/month covers 10M, then $0.30 per million. Tiles are cached for one day, by Cloudflare and by browsers. The cache key includes the Worker version, so a deploy purges Cloudflare's copy. Browsers can keep old tiles for up to a day after that, which is why a rebuilt tileset gets a new key.

Only cache misses run the Worker, and each one reads R2. A rate limit (`MISS_LIMITER` in `wrangler.jsonc`) answers 429 past 3,000 misses a minute from one client, counted by IPv4 address or IPv6 /64, in one Cloudflare location. It slows a single client's misses. Cache hits are billed too and pass it uncounted, so the guard on the total bill is a Cloudflare billing notification on the account.

## Settings

Each stack's app build reads two GitHub repo variables:

| Variable | Effect |
|---|---|
| `TILES_WORKER_URL_DEV`, `TILES_WORKER_URL_PROD` | The Worker's hostname for that stack, such as `https://1.tilesets.districtr.org`. Empty: the app reads the PMTiles archives from the CDN. |
| `TILES_SPLIT_DEV`, `TILES_SPLIT_PROD` | `true`: maps start on their parent-only archive. Takes effect only with the Worker URL set. |

To turn one on or off, change the variable and run the app deploy on that stack's branch: `gh workflow run deploy-app.yml --ref dev`. The values are baked into the build and are part of its image tag, so the run builds a new image for the same commit. PR previews use the dev values as of their own build.

## Local

```bash
bun install
curl -o mt.pmtiles https://tilesets1.cdn.districtr.org/tilesets/mt_districtr_view_v2.pmtiles
bunx wrangler r2 object put districtr-tilesets/tilesets/mt_districtr_view_v2.pmtiles --local --file mt.pmtiles
bun run dev     # http://localhost:8787
bun run check   # tiles must match what pmtiles reads from the CDN
```

To try it in the app, set `NEXT_PUBLIC_TILES_WORKER_URL=http://localhost:8787` in `app/.env.local`, plus `NEXT_PUBLIC_TILES_SPLIT=true` for the split, and restart the frontend. The split needs the map's parent-only archive in the local bucket too:

```bash
docker-compose run --rm -v "$PWD:/data" pipelines tile-join --no-tile-size-limit \
  -o /data/mt.parent.pmtiles -l mt_districtr_vtd_view_v2 /data/mt.pmtiles
bunx wrangler r2 object put districtr-tilesets/tilesets/mt_districtr_view_v2.parent.pmtiles --local --file mt.parent.pmtiles
```

## Deploys

Two Workers read the one bucket, as both stacks read one S3 bucket: `districtr-tiles-dev` (`env.dev` in `wrangler.jsonc`) for dev and `districtr-tiles` for prod. `.github/workflows/deploy-tiles-worker.yml` deploys the first on pushes to `dev` and the second on pushes to `main`, following the [deploy-authority](../agent-skills/deploy-authority/SKILL.md) rule; a pull request only type-checks. Once a stack's `TILES_WORKER_URL_*` is set, each deploy ends with `bun run check` against that hostname.

The workflow needs the secret `CLOUDFLARE_API_TOKEN` (the "Edit Cloudflare Workers" token template) and the variable `CLOUDFLARE_ACCOUNT_ID`.

## New tilesets

Set `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the pipeline's environment (see `pipelines/.env.example`). `tileset batch-create --upload` then copies each district `.pmtiles` to R2 under its S3 key, parent-only archives included. For tilesets built one at a time, step 3 of `run-map-onboarding` has the commands. Give a rebuilt tileset a new key instead of overwriting it, so every cache serves the new tiles from the start.

## Bootstrap

1. Use a Cloudflare account on Workers Paid. At about 14M requests a month, the free plan's daily cap is too small.
2. Create the bucket: `bunx wrangler r2 bucket create districtr-tilesets`.
3. Build the [parent-only archive](#parent-only-archives) of every existing map with a child layer, and upload each to S3 beside its combined archive. The list is every distinct `tiles_s3_path` in `districtrmap` that has a `child_layer`, hidden maps included, since their plans still open. For each one: `tile-join --no-tile-size-limit -o <name>.parent.pmtiles -l <parent_layer> <name>.pmtiles`. Take the layer name from the record: a mistyped name writes an empty archive and still exits with success. Check that each output lists that one layer and holds tiles.
4. Copy the tilesets: `rclone copy s3:<tileset bucket>/tilesets r2:districtr-tilesets/tilesets`. That's about 10 GB, or under $1 of S3 egress.
5. Deploy both Workers once by hand: `bun run deploy:dev` and `bun run deploy:prod`. A Worker has no address until its route exists. From the merge on, CI deploys both.
6. Set up the hostnames (next section), which route to the two Workers.
7. Check each hostname twice: `bun run check https://dev.tilesets.districtr.org`. The second run reports every tile as served from Cloudflare's cache.
8. Add the CI token and account id (see [Deploys](#deploys)), and a billing notification on the account.
9. Switch each stack over with its [settings](#settings): the Worker URL first, then the split. Before each switch, confirm that R2 holds the archive of every map in `districtrmap`, and before the split, the parent-only archive of every map with a child layer. A map whose archive is missing draws blank.

## Hostnames

Production serves `1.tilesets.districtr.org` and dev serves `dev.tilesets.districtr.org`, with `workers.dev` off. [ADR 0008](../docs/adr/0008-tiles-from-object-storage.md) records that tiles left R2 because a network blocked `pub-….r2.dev` URLs (#130), and `workers.dev` is the same kind of shared Cloudflare hostname.

`districtr.org` stays on Netlify DNS. Each tile hostname gets one CNAME there, pointing at a Cloudflare zone that runs [Cloudflare for SaaS with a Worker as its origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/). The Free plan includes 100 such hostnames. Delegating `tilesets.districtr.org` to Cloudflare as its own zone would need an Enterprise plan ([subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)).

1. **The Cloudflare zone is `districtr-ddri.org`**, registered through Cloudflare Registrar on the Districtr and DDRI account. It exists to carry these hostnames: any domain whose DNS is on Cloudflare works, and users see `districtr.org` names alone.
2. **Set up the zone for SaaS.**
   - Enable Cloudflare for SaaS.
   - Add a proxied `AAAA` record, `origin.districtr-ddri.org` → `100::`. It stands in for an origin server; the Workers answer every request.
   - Set that record as the fallback origin.
   - Add two Workers routes on the zone: `1.tilesets.districtr.org/*` to `districtr-tiles`, and `dev.tilesets.districtr.org/*` to `districtr-tiles-dev`.
3. **Add the custom hostnames** `1.tilesets.districtr.org` and `dev.tilesets.districtr.org` under SSL/TLS → Custom Hostnames.
4. **In Netlify DNS, add one CNAME per name**: `1.tilesets` → `origin.districtr-ddri.org`, and the same for `dev.tilesets`. That's the only change to `districtr.org`. Cloudflare then checks each hostname and issues its certificate over HTTP, so the zone needs no TXT records. `districtr.org` has no CAA records, so any CA can issue the certificate.
5. **Check it** with `bun run check https://dev.tilesets.districtr.org`, and the same for `1.tilesets`. Its TileJSON check also confirms the Worker sees the custom hostname.

Skipping the CNAMEs works too: attach each Worker as a custom domain on the tiles zone itself, such as `1.tiles.districtr-ddri.org`. That leaves `districtr.org` untouched, with the names outside it.
