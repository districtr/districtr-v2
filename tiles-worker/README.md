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
  - These names need the `districtr.org` zone on Cloudflare (decided 2026-11-05; see [Moving `districtr.org` to Cloudflare](#moving-districtrorg-to-cloudflare)). Delegating only `tilesets.districtr.org` would need an Enterprise plan, because Cloudflare accepts a subdomain as its own zone only on Enterprise ([subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)).
  - Worker custom domains can be multi-level names like `1.tilesets.districtr.org`, and each gets its own certificate.
- **Deploys through CI.** The [deploy-authority](../agent-skills/deploy-authority/SKILL.md) rule says live changes only go out from CI on `dev`/`main`. Add a `deploy-tiles-worker.yml` workflow with a `CLOUDFLARE_API_TOKEN` secret. The first bucket and deploy below are a one-time bootstrap.
- **New tilesets.** Set `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the pipeline's environment (see `pipelines/.env.example`). `tileset batch-create --upload` then copies each district `.pmtiles` to R2 under its S3 key. For tilesets built one at a time, step 3 of `run-map-onboarding` has the copy command. Give a rebuilt tileset a new key instead of overwriting it, so nothing stale is served and nothing needs purging.
- **Cost guard.** Nothing rate-limits cache misses yet. Add a Workers Rate Limiting binding and a Cloudflare billing notification.

## Bootstrap

1. Use a Cloudflare account on Workers Paid. At about 14M requests a month, the free plan's daily cap is too small.
2. Create the bucket: `bunx wrangler r2 bucket create districtr-tilesets`.
3. Copy the tilesets: `rclone copy s3:<tileset bucket>/tilesets r2:districtr-tilesets/tilesets`. That's a few GB, or under $1 of S3 egress.
4. Once `districtr.org` is on Cloudflare (next section), add one route per name to `wrangler.jsonc`, e.g. `"routes": [{"pattern": "1.tilesets.districtr.org", "custom_domain": true}, {"pattern": "2.tilesets.districtr.org", "custom_domain": true}]`, plus `"workers_dev": false`. Wrangler creates each DNS record and certificate.
5. Deploy once with `bun run deploy`, then check the deployed copy twice. The second run is served from cache: `bun run check https://1.tilesets.districtr.org`.
6. To switch dev over, emit `https://1.tilesets.districtr.org` from the `Set stack` step's dev branch in `.github/workflows/deploy-app.yml`, and add `NEXT_PUBLIC_TILES_WORKER_URL=${{ steps.cfg.outputs.tiles_worker_url }}` to its `.env.production` heredoc. Prod stays on the CDN while its value is empty. `preview.yml` writes its own heredoc.

## Moving `districtr.org` to Cloudflare

Today `districtr.org` is registered at Namecheap and uses Netlify DNS, whose nameservers are NS1's `dns1`–`dns4.p05.nsone.net`. DNSSEC is off. The move copies every record into a Cloudflare zone and then points Namecheap at Cloudflare's nameservers. Done carefully, users see no change.

1. **Add the zone.** Add `districtr.org` to Cloudflare on the Free plan. Its scan imports common records but misses some, so check its list against step 2.
2. **Copy every record as DNS only (grey cloud).** That keeps traffic going straight to AWS, as it does today. Proxying the app, API or CMS through Cloudflare would change TLS and caching, so treat that as a separate decision. The full list is in Netlify's DNS panel and in `pulumi stack output dnsRecords` on both stacks. Publicly visible on 2026-11-05:

   | Name | Type | Value |
   |---|---|---|
   | `districtr.org`, `www`, `api`, `cms` | CNAME | prod ALB, `districtr-prod-alb-….us-east-2.elb.amazonaws.com` |
   | `dev`, `api.dev`, `cms.dev`, `*.dev` | CNAME | dev ALB, `districtr-dev-alb-….us-east-2.elb.amazonaws.com` |
   | `cdn` | NS (4) | Route 53: `ns-717.awsdns-25.net`, `ns-350.awsdns-43.com`, `ns-1105.awsdns-10.org`, `ns-1617.awsdns-10.co.uk` |
   | `send` | CNAME | `send.forge.rmta.net` (email sending) |
   | `resend._domainkey` | TXT | DKIM key; copy it from Netlify |
   | `_dmarc` | TXT | `v=DMARC1; p=none;` |
   | `_<hash>.<host>` | CNAME | ACM validation records from `dnsRecords` |

   - The apex and `www` currently resolve to the ALB's IP addresses through a Netlify alias. Enter them as CNAMEs to the ALB hostname, which Cloudflare flattens at the apex, not as A records: ALB IPs change.
   - No scan finds the ACM records. Without them, AWS can't renew the certificates, and that failure only shows up months later.
3. **Compare before switching.** For each name, `dig +short <name> @<cloudflare nameserver>` must match `dig +short <name> @dns1.p05.nsone.net`.
4. **Switch nameservers.** In Namecheap, go to Domain, then Nameservers, then Custom DNS, and enter the two nameservers Cloudflare assigned. Propagation usually takes about an hour and can take up to 48. Both providers answer identically in the meantime, so leave the Netlify zone in place for a week.
5. **Verify, then clean up.** Check the app, API, CMS, a PR preview, a `tilesets1.cdn` tile and a test email. Then remove `districtr.org` from Netlify DNS, and update `infra/README.md`'s note that DNS hosting is external.
