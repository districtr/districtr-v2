# tiles-worker

A Cloudflare Worker that serves district tilesets as `z/x/y` vector tiles from PMTiles archives in R2. Cloudflare doesn't charge for bandwidth, and district tilesets are about 80% of CloudFront's bytes (2,640 of 3,368 GB from 2026-09-30 to 2026-10-30). Moving them would cut the CDN bill from about $234 to about $27 a month: roughly $6 for the Worker and $20 for what stays on CloudFront.

The paths mirror the S3 keys, so the app's source URL is `${NEXT_PUBLIC_TILES_WORKER_URL}/${tiles_s3_path}`:

| Path | Returns |
|---|---|
| `/tilesets/tx_districtr_view_v2.pmtiles` | TileJSON (not cached) |
| `/tilesets/tx_districtr_view_v2.pmtiles/{z}/{x}/{y}.mvt` | A tile, gzipped exactly as stored (`Content-Encoding: gzip`), or 204 if empty |

Anything else gets a 404, including query strings and non-GET requests, since Workers Cache would skip them and every one would read R2.

## Caching

Workers Cache (`cache` in `wrangler.jsonc`) answers repeat requests without running the Worker. Every request is billed, cached or not: $5/month covers 10M, then $0.30 per million. Tiles are cached for one day, by Cloudflare and by browsers. The cache key includes the Worker version, so a deploy purges Cloudflare's copy, for example after a tileset is rebuilt in place. Browsers can keep old tiles for up to a day after that.

## Local

```bash
bun install
curl -o mt.pmtiles https://tilesets1.cdn.districtr.org/tilesets/mt_districtr_view_v2.pmtiles
bunx wrangler r2 object put districtr-tilesets/tilesets/mt_districtr_view_v2.pmtiles --local --file mt.pmtiles
bun run dev     # http://localhost:8787
bun run check   # tiles must match what pmtiles reads from the CDN
```

To try it in the app, set `NEXT_PUBLIC_TILES_WORKER_URL=http://localhost:8787` in `app/.env.local`. If it's unset, the app reads PMTiles from the CDN as before.

## Before production

- **Hostnames: `1.tilesets.districtr.org`, `2.tilesets.districtr.org`, and so on (decided 2026-11-05).** [ADR 0008](../docs/adr/0008-tiles-from-object-storage.md) records that tiles left R2 because Cornell's network blocked `pub-….r2.dev` URLs (#130). `workers.dev` is the same kind of shared Cloudflare hostname, so production uses custom domains, with `workers.dev` turned off. All the names share one cache, since Workers Cache ignores the host. When the variable is first turned on, write an ADR that amends 0008.
  - `districtr.org` stays on Netlify DNS (decided 2026-11-06). Each name is one CNAME there, served through Cloudflare for SaaS; see [Hostnames](#hostnames).
  - Delegating `tilesets.districtr.org` to Cloudflare instead would need an Enterprise plan, because Cloudflare accepts a subdomain as its own zone only on Enterprise ([subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)).
- **Deploys through CI.** The [deploy-authority](../agent-skills/deploy-authority/SKILL.md) rule says live changes only go out from CI on `dev`/`main`. Add a `deploy-tiles-worker.yml` workflow with a `CLOUDFLARE_API_TOKEN` secret. The first bucket and deploy below are a one-time bootstrap.
- **New tilesets.** Set `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the pipeline's environment (see `pipelines/.env.example`). `tileset batch-create --upload` then copies each district `.pmtiles` to R2 under its S3 key. For tilesets built one at a time, step 3 of `run-map-onboarding` has the copy command. Give a rebuilt tileset a new key instead of overwriting it, so nothing stale is served and nothing needs purging.
- **Cost guard.** Nothing rate-limits cache misses yet. Add a Workers Rate Limiting binding and a Cloudflare billing notification.

## Bootstrap

1. Use a Cloudflare account on Workers Paid. At about 14M requests a month, the free plan's daily cap is too small.
2. Create the bucket: `bunx wrangler r2 bucket create districtr-tilesets`.
3. Copy the tilesets: `rclone copy s3:<tileset bucket>/tilesets r2:districtr-tilesets/tilesets`. That's a few GB, or under $1 of S3 egress.
4. Set up the hostnames (next section).
5. Deploy once with `bun run deploy`, then check the deployed copy twice. The second run is served from cache: `bun run check https://1.tilesets.districtr.org`.
6. To switch dev over, emit `https://1.tilesets.districtr.org` from the `Set stack` step's dev branch in `.github/workflows/deploy-app.yml`, and add `NEXT_PUBLIC_TILES_WORKER_URL=${{ steps.cfg.outputs.tiles_worker_url }}` to its `.env.production` heredoc. Prod stays on the CDN while its value is empty. `preview.yml` writes its own heredoc.

## Hostnames

`districtr.org` stays on Netlify DNS. Each tile hostname gets one CNAME there, pointing at a Cloudflare zone that runs [Cloudflare for SaaS with this Worker as its origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/). The Free plan includes 100 such hostnames.

1. **Get a Cloudflare zone.** Any domain whose DNS is on Cloudflare works. If there isn't one, register one through Cloudflare Registrar, for about $10 a year. It's called `<tiles zone>` below.
2. **Set up the zone for SaaS.**
   - Enable Cloudflare for SaaS.
   - Add a proxied `AAAA` record, `origin.<tiles zone>` → `100::`. No server sits behind it.
   - Set that record as the fallback origin.
   - Add a Workers route, `*/*` on the zone, to `districtr-tiles`.
3. **Add the custom hostnames** `1.tilesets.districtr.org`, `2.tilesets.districtr.org`, and so on, under SSL/TLS → Custom Hostnames.
4. **In Netlify DNS, add one CNAME per name**: `1.tilesets` → `origin.<tiles zone>`. That's the only change to `districtr.org`. Cloudflare then checks each hostname and issues its certificate over HTTP, so no TXT records are needed. `districtr.org` has no CAA records, so nothing blocks the certificate.
5. **Check it** with `bun run check https://1.tilesets.districtr.org`. Its TileJSON check also confirms the Worker sees the custom hostname. Then set `"workers_dev": false` in `wrangler.jsonc`.

Skipping the CNAMEs works too: attach the Worker as a custom domain on the tiles zone itself, such as `1.tiles.<tiles zone>`. That needs no change to `districtr.org` at all, but the names are then outside it.
