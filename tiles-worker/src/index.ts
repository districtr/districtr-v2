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
const CACHE_CONTROL = 'public, max-age=86400';

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(ROUTE);
    // Workers Cache skips anything but a plain GET/HEAD and keys on the query string, so
    // these would read R2 on every request. MapLibre never sends them.
    const cacheable =
      (request.method === 'GET' || request.method === 'HEAD') &&
      !url.search &&
      !request.headers.has('Authorization');
    if (!match || !cacheable) return notFound();
    const [, key, z, x, y] = match;
    // Workers Cache answers repeat requests, so a request that gets here is a cache miss
    // about to read R2. The limit (wrangler.jsonc) counts per client address in each
    // Cloudflare location: far above a classroom sharing one address, and a ceiling on
    // what a scripted client can cost.
    const client = request.headers.get('CF-Connecting-IP') ?? '';
    if (!(await env.MISS_LIMITER.limit({key: client})).success) {
      return respond('Too many requests', {'Cache-Control': 'no-store', 'Retry-After': '60'}, 429);
    }
    const source = new R2Source(env.BUCKET, key);
    try {
      if (z === undefined) {
        // Not cached: the tile URLs inside name this request's origin, and the cache key
        // ignores the host. MapLibre fetches it once per map load.
        const tilejson = (await new PMTiles(source, DIRECTORIES).getTileJson(
          `${url.origin}/${key}`
        )) as Record<string, unknown>;
        // MapLibre reports an error for each style layer whose source-layer the TileJSON
        // leaves out, and the app's child layers stay on the source while a parent-only
        // archive is loaded. With vector_layers absent, MapLibre skips that check.
        delete tilejson.vector_layers;
        return respond(JSON.stringify(tilejson), {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
      }
      // pmtiles' tile ids only cover z <= 26 and in-range x/y; it throws past that.
      if (+z > 26 || +x >= 2 ** +z || +y >= 2 ** +z) return notFound();
      // PMTiles applies its own decompress to tiles and metadata, while DIRECTORIES
      // decompresses headers and directories. So the TileJSON above keeps the default gzip,
      // and this identity decompress returns tiles exactly as stored.
      const archive = new PMTiles(source, DIRECTORIES, async buf => buf);
      const header = await archive.getHeader();
      const tile = await archive.getZxy(+z, +x, +y);
      if (!tile) return respond(null, {}, 204);
      const encoding = CONTENT_ENCODING[header.tileCompression];
      return respond(tile.data, {
        'Content-Type': 'application/x-protobuf',
        ...(encoding && {'Content-Encoding': encoding}),
      });
    } catch (e) {
      if (e instanceof NotFound) return notFound();
      throw e;
    }
  },
} satisfies ExportedHandler<Env>;
