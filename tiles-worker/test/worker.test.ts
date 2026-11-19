// The Worker's request handling, run against a stand-in limiter and bucket. Tile bytes
// and encoding need a real archive; check.ts compares those with the CDN.
import {beforeEach, describe, expect, spyOn, test} from 'bun:test';
import worker from '../src/index';

let limiterKeys: string[];
let limiterAllows: boolean;
let bucketReads: number;
let bucketGet: () => Promise<unknown>;

const env = {
  MISS_LIMITER: {
    limit: async ({key}: {key: string}) => {
      limiterKeys.push(key);
      return {success: limiterAllows};
    },
  },
  BUCKET: {
    get: () => {
      bucketReads++;
      return bucketGet();
    },
  },
};

const TILE = '/tilesets/mt.pmtiles/3/1/2.mvt';
const get = (path: string, init?: RequestInit): Promise<Response> =>
  (worker as any).fetch(new Request(`https://tiles.test${path}`, init), env, {});
const from = (ip: string) => ({headers: {'CF-Connecting-IP': ip}});

beforeEach(() => {
  limiterKeys = [];
  limiterAllows = true;
  bucketReads = 0;
  bucketGet = async () => null;
});

describe('requests Workers Cache would skip', () => {
  test.each([
    ['a query string', `${TILE}?bust=1`, undefined],
    ['a POST', TILE, {method: 'POST'}],
    ['an Authorization header', TILE, {headers: {Authorization: 'Bearer x'}}],
    ['a padded tile number', '/tilesets/mt.pmtiles/3/01/2.mvt', undefined],
    ['a key outside tilesets/', '/other/mt.pmtiles', undefined],
    ['a key in a subfolder', '/tilesets/a/mt.pmtiles', undefined],
  ])('%s gets a 404 before the limiter and R2', async (_name, path, init) => {
    const response = await get(path, init as RequestInit | undefined);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(limiterKeys).toEqual([]);
    expect(bucketReads).toBe(0);
  });

  test('a HEAD request is served like a GET', async () => {
    await get(TILE, {method: 'HEAD'});
    expect(limiterKeys.length).toBe(1);
  });
});

describe('the miss limiter', () => {
  test('a client past the limit gets a 429 and R2 is not read', async () => {
    limiterAllows = false;
    const response = await get(TILE, from('203.0.113.7'));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(bucketReads).toBe(0);
  });

  test('an IPv4 client counts by its address', async () => {
    await get(TILE, from('203.0.113.7'));
    expect(limiterKeys).toEqual(['203.0.113.7']);
  });

  test.each([
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::9', '2001:db8:1:2::/64'],
    ['2001:db8::9', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
  ])('IPv6 client %s counts by its /64', async (ip, key) => {
    await get(TILE, from(ip));
    expect(limiterKeys).toEqual([key]);
  });
});

describe('tiles', () => {
  test.each([
    ['z past 26', '/tilesets/mt.pmtiles/27/0/0.mvt'],
    ['x past the zoom', '/tilesets/mt.pmtiles/3/8/0.mvt'],
    ['y past the zoom', '/tilesets/mt.pmtiles/3/0/8.mvt'],
  ])('%s gets a 404 without an R2 read', async (_name, path) => {
    const response = await get(path);
    expect(response.status).toBe(404);
    expect(bucketReads).toBe(0);
  });

  test('a missing archive gets an uncached 404', async () => {
    const response = await get(TILE);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(bucketReads).toBeGreaterThan(0);
  });

  test('an R2 failure gets an uncached 500 that the browser can read', async () => {
    bucketGet = async () => {
      throw new Error('R2 is down');
    };
    const logged = spyOn(console, 'error').mockImplementation(() => {});
    const response = await get(TILE);
    logged.mockRestore();
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
