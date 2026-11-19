// Parity check: tiles from the Worker must match what the app's pmtiles client reads
// from the CDN today. Usage: bun check.ts [worker] [cdn] [key]
// The default archive has leaf directories, so lookups take the large-state path.
import {PMTiles} from 'pmtiles';

const [
  worker = 'http://localhost:8787',
  cdn = 'https://tilesets1.cdn.districtr.org',
  key = 'tilesets/mt_districtr_view_v2.pmtiles',
] = process.argv.slice(2);

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const direct = new PMTiles(`${cdn}/${key}`);
const header = await direct.getHeader();
const tilejsonResp = await fetch(`${worker}/${key}`);
assert(tilejsonResp.headers.get('access-control-allow-origin') === '*', 'TileJSON lacks CORS');
// Browsers may keep it; Cloudflare must not, since its cache key ignores the host.
assert(
  tilejsonResp.headers.get('cache-control') === 'private, max-age=3600',
  'TileJSON should be cacheable by browsers alone'
);
assert(tilejsonResp.headers.get('cf-cache-status') !== 'HIT', 'TileJSON came from Cloudflare');
const tilejson = await tilejsonResp.json();
assert(
  tilejson.minzoom === header.minZoom && tilejson.maxzoom === header.maxZoom,
  'TileJSON zooms differ'
);
// The app's child layers stay on the source while a parent-only archive is loaded;
// a vector_layers list would make MapLibre report each of them.
assert(!('vector_layers' in tilejson), 'TileJSON should omit vector_layers');
assert(
  tilejson.tiles[0] === `${worker}/${key}/{z}/{x}/{y}.mvt`,
  `unexpected tile URL ${tilejson.tiles[0]}`
);

const tileAt = (z: number, lon: number, lat: number): [number, number] => {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n),
  ];
};

let compared = 0;
let cacheHits = 0;
let notModified = 0;
for (let z = header.minZoom; z <= header.maxZoom; z++) {
  const [cx, cy] = tileAt(z, header.centerLon, header.centerLat);
  for (const [x, y] of [
    [cx, cy],
    [cx + 1, cy],
    [cx, cy + 1],
  ]) {
    const expected = await direct.getZxy(z, x, y);
    const resp = await fetch(`${worker}/${key}/${z}/${x}/${y}.mvt`);
    // The cost saving rests on tiles being cacheable, empty ones included: an uncached
    // tile runs the Worker and reads R2 on every request.
    assert(
      resp.headers.get('cache-control') === 'public, max-age=86400, stale-while-revalidate=604800',
      `${z}/${x}/${y}: not cacheable (${resp.headers.get('cache-control')})`
    );
    if (!expected) {
      assert(resp.status === 204, `${z}/${x}/${y}: expected 204, got ${resp.status}`);
      continue;
    }
    assert(resp.headers.get('content-encoding') === 'gzip', `${z}/${x}/${y}: not gzip-encoded`);
    assert(resp.headers.get('access-control-allow-origin') === '*', `${z}/${x}/${y}: no CORS`);
    // fetch undoes Content-Encoding, so this is the decoded tile, same as getZxy's.
    const body = new Uint8Array(await resp.arrayBuffer());
    assert(
      Buffer.compare(body, new Uint8Array(expected.data)) === 0,
      `${z}/${x}/${y}: bytes differ`
    );
    compared++;
    if (resp.headers.get('cf-cache-status') === 'HIT') cacheHits++;
    // A copy that is still current is answered with a 304 and no tile.
    const etag = resp.headers.get('etag');
    assert(etag, `${z}/${x}/${y}: no ETag`);
    const again = await fetch(`${worker}/${key}/${z}/${x}/${y}.mvt`, {
      headers: {'If-None-Match': etag},
    });
    if (again.status === 304) notModified++;
  }
}
assert(compared > 0, 'no tiles compared');

const status = async (path: string, init?: RequestInit) =>
  (await fetch(`${worker}/${path}`, init)).status;
const [cx, cy] = tileAt(header.maxZoom, header.centerLon, header.centerLat);
const tile = `${key}/${header.maxZoom}/${cx}/${cy}.mvt`;
assert((await status(`${key}/${header.maxZoom + 1}/0/0.mvt`)) === 204, 'past maxzoom should 204');
const missing = await fetch(`${worker}/tilesets/missing.pmtiles`);
assert(missing.status === 404, 'missing archive should 404');
assert(missing.headers.get('cache-control') === 'no-store', '404 must not be cached');
// Each of these would skip Workers Cache, so the Worker refuses them.
assert((await status(`${tile}?bust=1`)) === 404, 'query string should 404');
assert((await status(tile, {method: 'POST'})) === 404, 'POST should 404');
assert((await status(tile.replace(`/${cx}/`, `/0${cx}/`))) === 404, 'padded x should 404');
assert((await status(`${key}/27/0/0.mvt`)) === 404, 'z > 26 should 404');
assert((await status(`${key}/3/8/0.mvt`)) === 404, 'x past the zoom should 404');
// Against a deployed Worker, a repeat run reports cache hits. Each Cloudflare location
// keeps its own cache, so the count can stay below the total for a few runs.
console.log(
  `ok: ${compared} tiles match across z${header.minZoom}-${header.maxZoom} for ${key}` +
    ` (${cacheHits} served from Cloudflare's cache, ${notModified} answered 304 to their own ETag)`
);
