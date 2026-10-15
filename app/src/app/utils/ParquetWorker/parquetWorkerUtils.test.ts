/**
 * Multi-range prefetch and row group selection for the parquet worker.
 * Run with `bun test`.
 */
import {afterEach, describe, expect, test} from 'bun:test';
import {FileMetaData} from 'hyparquet';
import {prefetchAsyncBuffer, rowGroupsContaining} from './parquetWorkerUtils';

const bytes = new Uint8Array(300_000).map((_, i) => i);
bytes.set([13, 10, 13, 10], 100_010); // header terminator inside a payload
const ranges: Array<[number, number]> = [
  [0, 100],
  [100_000, 100_100],
  [200_000, 200_100],
];
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Fake server: multiple ranges get a multipart body, or the whole file like S3 */
function serve(multipart: boolean) {
  const headers: string[] = [];
  let cancelled = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const header = new Headers(init.headers).get('Range')!;
    headers.push(header);
    const parsed = header
      .slice(6)
      .split(',')
      .map(range => range.split('-').map(Number));
    if (!multipart) {
      const body = new ReadableStream({
        start: controller => controller.enqueue(bytes),
        cancel: () => void cancelled++,
      });
      return new Response(body, {status: 200});
    }
    const encoder = new TextEncoder();
    const parts = parsed.flatMap(([start, end]) => [
      encoder.encode(`\r\n--xyz\r\nContent-Range: bytes ${start}-${end}/${bytes.length}\r\n\r\n`),
      bytes.slice(start, end + 1),
    ]);
    return new Response(new Blob([...parts, encoder.encode('\r\n--xyz--\r\n')]), {
      status: 206,
      headers: {'Content-Type': 'multipart/byteranges; boundary=xyz'},
    });
  }) as typeof fetch;
  return {headers, cancelled: () => cancelled};
}

/** Single range file that records its reads */
function singleRangeFile() {
  const reads: string[] = [];
  return {
    reads,
    file: {
      byteLength: bytes.length,
      slice: (start: number, end = bytes.length) => {
        reads.push(`${start}-${end}`);
        return bytes.slice(start, end).buffer;
      },
    },
  };
}

async function expectSlices(file: {slice: (start: number, end: number) => unknown}) {
  for (const [start, end] of ranges) {
    const slice = (await file.slice(start, end)) as ArrayBuffer;
    expect(new Uint8Array(slice)).toEqual(bytes.slice(start, end));
  }
}

describe('prefetchAsyncBuffer', () => {
  test('fetches scattered ranges in one multipart request', async () => {
    const server = serve(true);
    const {file, reads} = singleRangeFile();
    const prefetched = await prefetchAsyncBuffer(file, 'https://a.test/multi.parquet', ranges);
    await expectSlices(prefetched);
    expect(server.headers).toEqual(['bytes=0-99,100000-100099,200000-200099']);
    expect(reads).toEqual([]);
  });

  test('falls back to single ranges when the server sends the whole file', async () => {
    const server = serve(false);
    const {file, reads} = singleRangeFile();
    const url = 'https://a.test/s3.parquet';
    await expectSlices(await prefetchAsyncBuffer(file, url, ranges));
    expect(server.cancelled()).toBe(1);
    expect(reads).toEqual(['0-100', '100000-100100', '200000-200100']);
    // and stops trying multi-range for that url
    await prefetchAsyncBuffer(file, url, ranges);
    expect(server.headers.length).toBe(1);
  });
});

describe('rowGroupsContaining', () => {
  const stats = [
    ['01', '03'],
    ['04', '06'],
    ['07', '09'],
  ];
  const metadata = {
    row_groups: stats.map(([min, max]) => ({
      columns: [{meta_data: {path_in_schema: ['path'], statistics: {min, max}}}],
    })),
  } as unknown as FileMetaData;

  test('selects only the row groups holding a value', () => {
    expect(rowGroupsContaining(metadata, 'path', ['02', '08'])).toEqual([0, 2]);
    expect(rowGroupsContaining(metadata, 'path', ['10'])).toEqual([]);
  });
});
