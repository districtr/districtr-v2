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
//   /tilesets/tx.pmtiles/{z}/{x}/{y}.mvt  one tile, still compressed as stored
const ROUTE = /^\/(.+?\.pmtiles)(?:\/(\d+)\/(\d+)\/(\d+)\.mvt)?$/;

// Workers Cache (wrangler.jsonc) serves repeats without running the Worker. Its key
// includes the Worker version, so a deploy is also a full purge.
const CACHE_CONTROL = 'public, max-age=86400';

const CONTENT_ENCODING: Partial<Record<Compression, string>> = {
  [Compression.Gzip]: 'gzip',
  [Compression.Brotli]: 'br',
  [Compression.Zstd]: 'zstd',
};

class NotFound extends Error {}

async function decompress(buf: ArrayBuffer, compression: Compression): Promise<ArrayBuffer> {
  if (compression === Compression.None || compression === Compression.Unknown) return buf;
  if (compression !== Compression.Gzip) throw new Error(`Unsupported compression ${compression}`);
  return new Response(
    new Response(buf).body!.pipeThrough(new DecompressionStream('gzip'))
  ).arrayBuffer();
}

// Headers and directories, shared across requests. Holds resolved values, not promises,
// so no request waits on another request's I/O.
const DIRECTORIES = new ResolvedValueCache(100, undefined, decompress);

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(ROUTE);
    if (!match) return respond('Not found', {'Cache-Control': 'no-store'}, 404);
    const [, key, z, x, y] = match;
    const source = new R2Source(env.BUCKET, key);
    try {
      if (z === undefined) {
        const tilejson = await new PMTiles(source, DIRECTORIES, decompress).getTileJson(
          `${url.origin}/${key}`
        );
        return respond(JSON.stringify(tilejson), {'Content-Type': 'application/json'});
      }
      // Identity decompress keeps tile bytes as stored; the browser undoes Content-Encoding.
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
      if (e instanceof NotFound) return respond('Not found', {'Cache-Control': 'no-store'}, 404);
      throw e;
    }
  },
} satisfies ExportedHandler<Env>;
