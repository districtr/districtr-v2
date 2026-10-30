// Parity check: tiles from the Worker must match what the app's pmtiles client reads
// from the CDN today. Usage: bun check.ts [worker] [cdn] [key]
import {PMTiles} from 'pmtiles';

const [
  worker = 'http://localhost:8787',
  cdn = 'https://tilesets1.cdn.districtr.org',
  key = 'tilesets/wy_districtr_view_v2.pmtiles',
] = process.argv.slice(2);

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const direct = new PMTiles(`${cdn}/${key}`);
const header = await direct.getHeader();
const tilejson = await (await fetch(`${worker}/${key}`)).json();
assert(
  tilejson.minzoom === header.minZoom && tilejson.maxzoom === header.maxZoom,
  'TileJSON zooms differ'
);
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
for (let z = header.minZoom; z <= header.maxZoom; z++) {
  const [cx, cy] = tileAt(z, header.centerLon, header.centerLat);
  for (const [x, y] of [
    [cx, cy],
    [cx + 1, cy],
    [cx, cy + 1],
  ]) {
    const expected = await direct.getZxy(z, x, y);
    const resp = await fetch(`${worker}/${key}/${z}/${x}/${y}.mvt`);
    if (!expected) {
      assert(resp.status === 204, `${z}/${x}/${y}: expected 204, got ${resp.status}`);
      continue;
    }
    assert(resp.headers.get('content-encoding') === 'gzip', `${z}/${x}/${y}: not gzip-encoded`);
    // fetch undoes Content-Encoding, so this is the decoded tile, same as getZxy's.
    const body = new Uint8Array(await resp.arrayBuffer());
    assert(
      Buffer.compare(body, new Uint8Array(expected.data)) === 0,
      `${z}/${x}/${y}: bytes differ`
    );
    compared++;
  }
}
assert(compared > 0, 'no tiles compared');
assert(
  (await fetch(`${worker}/tilesets/missing.pmtiles`)).status === 404,
  'missing archive should 404'
);
console.log(`ok: ${compared} tiles match across z${header.minZoom}-${header.maxZoom} for ${key}`);
