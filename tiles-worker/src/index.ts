import {
  Compression,
  EtagMismatch,
  PMTiles,
  ResolvedValueCache,
  type RangeResponse,
  type Source,
} from 'pmtiles';

// Paths mirror the bucket's keys, so the app's source URL is `${worker}/${tiles_s3_path}`:
//   /tilesets/tx.pmtiles                  TileJSON
//   /tilesets/tx.parent.pmtiles           the same for the parent-only archive
//   /tilesets/tx.pmtiles/{z}/{x}/{y}.mvt  one tile, still compressed as stored
// Numbers must be canonical, so /09/… can't add a second cache entry for /9/….
const ROUTE =
  /^\/(tilesets\/[\w.-]+\.pmtiles)(?:\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/(0|[1-9]\d*)\.mvt)?$/;

// Workers Cache (wrangler.jsonc) serves repeats without running the Worker. Its key
// includes the Worker version, so a deploy purges Cloudflare's copy; browsers keep theirs.
// A tile is fresh for a day. For a week after that, a cache answers with its expired copy
// at once and fetches a fresh one in the background, so a returning user gets a tile
// that is unchanged with no wait. An expired copy otherwise costs as much as a miss.
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

const CONTENT_ENCODING: Partial<Record<Compression, string>> = {
  [Compression.Gzip]: 'gzip',
  [Compression.Brotli]: 'br',
  [Compression.Zstd]: 'zstd',
};

class NotFound extends Error {}

// Headers and directories, shared across requests. Workers can't await a promise another
// request created, so this caches resolved values; the default SharedPromiseCache would break.
const DIRECTORIES = new ResolvedValueCache(100);

class R2Source implements Source {
  constructor(
    private bucket: R2Bucket,
    private key: string
  ) {}

  getKey() {
    return this.key;
  }

  async getBytes(
    offset: number,
    length: number,
    _signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, {
      range: {offset, length},
      onlyIf: {etagMatches: etag},
    });
    if (!object) throw new NotFound();
    // A failed etagMatches returns the object without a body: the archive was replaced.
    if (!('body' in object)) throw new EtagMismatch();
    return {data: await object.arrayBuffer(), etag: object.etag};
  }
}

function respond(body: BodyInit | null, headers: Record<string, string>, status = 200): Response {
  return new Response(body, {
    status,
    headers: {'Cache-Control': CACHE_CONTROL, 'Access-Control-Allow-Origin': '*', ...headers},
    // Tiles arrive already compressed; send them as is instead of re-encoding.
    encodeBody: 'manual',
  });
}

const notFound = () => respond('Not found', {'Cache-Control': 'no-store'}, 404);

// Whether an If-None-Match header names this ETag. Cloudflare marks an ETag weak (W/)
// when it re-encodes a body, and the comparison ignores that mark.
function matchesEtag(ifNoneMatch: string, etag: string): boolean {
  return ifNoneMatch
    .split(',')
    .map(candidate => candidate.trim().replace(/^W\//, ''))
    .some(candidate => candidate === '*' || candidate === etag);
}

// The rate limit's key for a client. One network holds 2^64 IPv6 addresses, so an IPv6
// client counts by its /64; an IPv4 client counts by its address.
function clientKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups
    .slice(0, 4)
    .map(group => parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(ROUTE);
    // Workers Cache skips anything but a plain GET/HEAD and keys on the query string, so
    // these would read R2 on every request. MapLibre never sends them.
    // Workers Cache also keys on a few forwarding headers (X-Forwarded-Host, Forwarded
    // and the like), so each new value of one is a miss. Those requests are served all
    // the same: a proxy on a user's network may add such a header, and a refusal would
    // blank that user's map. The limiter below counts their misses like any other.
    const cacheable =
      (request.method === 'GET' || request.method === 'HEAD') &&
      !url.search &&
      !request.headers.has('Authorization');
    if (!match || !cacheable) return notFound();
    const [, key, z, x, y] = match;
    // pmtiles' tile ids only cover z <= 26 and in-range x/y; it throws past that. Checked
    // ahead of the limiter, so an address that can't hold a tile costs its client nothing.
    if (z !== undefined && (+z > 26 || +x >= 2 ** +z || +y >= 2 ** +z)) return notFound();
    // Workers Cache answers repeat requests, so a request that gets here is a cache miss
    // about to read R2. The limit (wrangler.jsonc) counts those per client in each
    // Cloudflare location, far above a classroom sharing one address. It slows one
    // client's misses; the account's billing notification watches the total (README).
    const client = clientKey(request.headers.get('CF-Connecting-IP') ?? '');
    let allowed = true;
    try {
      allowed = (await env.MISS_LIMITER.limit({key: client})).success;
    } catch (e) {
      // A limiter that fails lets the request through uncounted: the tiles stay up, and
      // the billing notification still watches the total.
      console.error(e);
    }
    if (!allowed) {
      return respond('Too many requests', {'Cache-Control': 'no-store', 'Retry-After': '60'}, 429);
    }
    const source = new R2Source(env.BUCKET, key);
    try {
      if (z === undefined) {
        // Kept by browsers for an hour and never by Cloudflare (`private`): the tile URLs
        // inside name this request's origin, and Cloudflare's cache key ignores the host,
        // while a browser stores by full URL. MapLibre fetches it once per map load, ahead
        // of any tile.
        const tilejson = (await new PMTiles(source, DIRECTORIES).getTileJson(
          `${url.origin}/${key}`
        )) as Record<string, unknown>;
        // MapLibre reports an error for each style layer whose source-layer the TileJSON
        // leaves out, and the app's child layers stay on the source while a parent-only
        // archive is loaded. With vector_layers absent, MapLibre skips that check.
        delete tilejson.vector_layers;
        return respond(JSON.stringify(tilejson), {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=3600',
        });
      }
      // A tile's ETag is its archive's, since a tile changes only when the archive is
      // replaced. So a browser or Cloudflare's cache asking whether its expired copy is
      // still current gets its answer from the archive's etag, with no tile read and no
      // tile sent.
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch) {
        const object = await env.BUCKET.head(key);
        if (!object) return notFound();
        if (matchesEtag(ifNoneMatch, object.httpEtag)) {
          return respond(null, {ETag: object.httpEtag}, 304);
        }
      }
      // PMTiles applies its own decompress to tiles and metadata, while DIRECTORIES
      // decompresses headers and directories. So the TileJSON above keeps the default gzip,
      // and this identity decompress returns tiles exactly as stored.
      const archive = new PMTiles(source, DIRECTORIES, async buf => buf);
      const tile = await archive.getZxy(+z, +x, +y);
      if (!tile) return respond(null, {}, 204);
      // Read after the tile: a lookup that found the archive replaced has refreshed it.
      const header = await archive.getHeader();
      const encoding = CONTENT_ENCODING[header.tileCompression];
      return respond(tile.data, {
        'Content-Type': 'application/x-protobuf',
        ...(encoding && {'Content-Encoding': encoding}),
        // Exposed so MapLibre can read it: it skips re-parsing a tile whose ETag is the
        // one it already holds.
        ...(header.etag && {ETag: `"${header.etag}"`, 'Access-Control-Expose-Headers': 'ETag'}),
      });
    } catch (e) {
      if (e instanceof NotFound) return notFound();
      // Answered through respond(), so the browser shows the status. A thrown error
      // reaches it as a response lacking the CORS header.
      console.error(e);
      return respond('Internal error', {'Cache-Control': 'no-store'}, 500);
    }
  },
} satisfies ExportedHandler<Env>;
