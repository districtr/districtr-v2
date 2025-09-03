// npm i hyparquet hyparquet-compressors
import {parquetMetadataAsync, parquetReadObjects, FileMetaData} from 'hyparquet';
import {compressors as defaultCompressors} from 'hyparquet-compressors';

/* ---------------------------------- utils --------------------------------- */

async function fetchRange(url: string, start: number, end: number, requestInit: RequestInit) {
  const headers = {...(requestInit?.headers || {}), Range: `bytes=${start}-${end - 1}`};
  const res = await fetch(url, {...requestInit, headers});
  if (!res.ok) throw new Error(`Range request failed ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer()).buffer;
}

async function getRemoteByteLength(url: string, requestInit: RequestInit, byteLength: number) {
  if (typeof byteLength === 'number') return byteLength;
  const res = await fetch(url, {method: 'HEAD', ...requestInit});
  const len = res.headers.get('content-length');
  if (!len) throw new Error('Missing content-length; pass byteLength explicitly');
  return Number(len);
}

async function loadMetadata(url: string, requestInit?: RequestInit, byteLength?: number) {
  const size = await getRemoteByteLength(url, requestInit ?? {}, byteLength);
  const file = {
    byteLength: size,
    slice: (start: number, end: number) => fetchRange(url, start, end ?? size, requestInit ?? {}),
  };
  // compressors are NOT needed for footer parsing
  const metadata = await parquetMetadataAsync(file);
  return {metadata, size};
}

function rowGroupByteRange(metadata: FileMetaData, idx: number) {
  const rg = metadata.row_groups[idx];
  if (!rg) throw new Error(`No row group at index ${idx}`);
  let start = Number.MAX_SAFE_INTEGER;
  let end = 0;
  for (const c of rg.columns) {
    const md = c.meta_data;
    if (!md) continue;
    const offs = Number(
      md.dictionary_page_offset != null
        ? Math.min(Number(md.dictionary_page_offset), Number(md.data_page_offset))
        : Number(md.data_page_offset)
    );
    const e = offs + Number(md.total_compressed_size);
    if (offs < start) start = offs;
    if (e > end) end = e;
  }
  return [start, end];
}

function coalesceRanges(ranges: [number, number][], mergeIfGapLTE = 0) {
  if (!ranges.length) return [];
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const out = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    const last = out[out.length - 1];
    if (s <= last[1] + mergeIfGapLTE) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/* --------------------- multipart/byteranges parsing ----------------------- */

function bytesIndexOf(haystack: Uint8Array, needle: Uint8Array, from = 0) {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function decodeAscii(u8: Uint8Array, start: number, end: number) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(u8[i]);
  return s;
}

function parseMultipartByteranges(arrayBuffer: ArrayBuffer, boundary: string) {
  const u8 = new Uint8Array(arrayBuffer);
  const DASHDASH = new Uint8Array([45, 45]);
  const CRLF = new Uint8Array([13, 10]);
  const boundaryBytes = new TextEncoder().encode(boundary);
  const sep = new Uint8Array([...DASHDASH, ...boundaryBytes]);

  let cursor = 0;
  const parts = [];

  let pos = bytesIndexOf(u8, sep, cursor);
  if (pos === -1) throw new Error('boundary not found');
  cursor = pos + sep.length;

  while (true) {
    if (u8[cursor] === 45 && u8[cursor + 1] === 45) break; // end: "--"
    if (u8[cursor] === 13 && u8[cursor + 1] === 10) cursor += 2;
    else if (u8[cursor] === 10) cursor += 1;

    const headersEnd = (() => {
      const idx = bytesIndexOf(u8, new Uint8Array([13, 10, 13, 10]), cursor);
      if (idx === -1) throw new Error('Malformed multipart: missing header terminator');
      return idx;
    })();
    const headerText = decodeAscii(u8, cursor, headersEnd);
    cursor = headersEnd + 4;

    let nextBoundary = bytesIndexOf(u8, sep, cursor);
    if (nextBoundary === -1) throw new Error('Malformed multipart: missing next boundary');

    let bodyEnd = nextBoundary;
    if (u8[bodyEnd - 2] === 13 && u8[bodyEnd - 1] === 10) bodyEnd -= 2;

    const crMatch = headerText.match(/Content-Range:\s*bytes\s+(\d+)-(\d+)\/(\d+)/i);
    if (!crMatch) throw new Error('Missing Content-Range in part');
    const start = Number(crMatch[1]);
    const end = Number(crMatch[2]) + 1;
    const ab = u8.slice(cursor, bodyEnd).buffer;
    parts.push({start, end, ab});

    cursor = nextBoundary + sep.length;
    if (u8[cursor] === 45 && u8[cursor + 1] === 45) break;
    if (u8[cursor] === 13 && u8[cursor + 1] === 10) cursor += 2;
    else if (u8[cursor] === 10) cursor += 1;
  }

  return parts;
}

async function fetchMultiRangeOrFallback(
  url: string,
  ranges: [number, number][],
  requestInit: RequestInit
) {
  if (!ranges.length) return [];

  // 1) try multi-range
  try {
    const headerVal = 'bytes=' + ranges.map(([s, e]) => `${s}-${e - 1}`).join(',');
    const headers = {...(requestInit?.headers || {}), Range: headerVal};
    const res = await fetch(url, {...requestInit, headers});
    if (res.status === 206) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.startsWith('multipart/byteranges')) {
        const m = ct.match(/boundary=([^\s;]+)/i);
        if (!m) throw new Error('Missing boundary');
        const ab = await res.arrayBuffer();
        return parseMultipartByteranges(ab, m[1]);
      }
      const cr = res.headers.get('content-range');
      const ab = await res.arrayBuffer();
      if (cr) {
        const m2 = cr.match(/bytes\s+(\d+)-(\d+)\//i);
        if (m2) {
          const start = Number(m2[1]);
          const end = Number(m2[2]) + 1;
          return [{start, end, ab}];
        }
      }
    }
  } catch (_) {
    /* fall through */
  }

  // 2) single contiguous superset
  const [minStart, maxEnd] = ranges.reduce(
    (acc, [s, e]) => [Math.min(acc[0], s), Math.max(acc[1], e)],
    [Number.MAX_SAFE_INTEGER, 0]
  );
  try {
    const ab = await fetchRange(url, minStart, maxEnd, requestInit);
    return [{start: minStart, end: maxEnd, ab}];
  } catch (_) {
    /* fall through */
  }

  // 3) one-by-one
  const parts = [];
  for (const [s, e] of ranges) {
    const ab = await fetchRange(url, s, e, requestInit);
    parts.push({start: s, end: e, ab});
  }
  return parts;
}

/* ------------------------ caching AsyncBuffer builder --------------------- */

function makeCachingAsyncBuffer({
  url,
  size,
  requestInit,
  cachedSegments = [],
}: {
  url: string;
  size: number;
  requestInit?: RequestInit;
  cachedSegments: {start: number; end: number; ab: ArrayBuffer}[];
}) {
  const segs = cachedSegments.slice().sort((a, b) => a.start - b.start);
  return {
    byteLength: size,
    async slice(start: number, end = size) {
      for (const seg of segs) {
        if (start >= seg.start && end <= seg.end) {
          const offset = start - seg.start;
          return seg.ab.slice(offset, offset + (end - start));
        }
      }
      // Cache miss
      return fetchRange(url, start, end, requestInit);
    },
  };
}

/* ------------------------------- main API -------------------------------- */

/**
 * Read multiple row groups using a single multi-range request (with compressors).
 *
 * @param {Object} params
 * @param {string} params.url
 * @param {number[]} params.rowGroupIndices
 * @param {string[]=} params.columns
 * @param {RequestInit=} params.requestInit
 * @param {number=} params.byteLength
 * @param {Record<string, any>=} params.compressors - override/extend defaults
 * @returns {Promise<{ rows: any[], metadata: any }>}
 */
export async function readRowGroupsObjects({
  url,
  rowGroupIndices,
  columns,
  requestInit,
  byteLength,
  compressors = defaultCompressors, // <-- compressors included
}: {
  url: string;
  rowGroupIndices: number[];
  columns?: string[];
  requestInit?: RequestInit;
  byteLength?: number;
  compressors?: Record<string, any>;
}) {
  if (!Array.isArray(rowGroupIndices) || rowGroupIndices.length === 0) {
    throw new Error('rowGroupIndices must be a non-empty array');
  }
  const {metadata, size} = await loadMetadata(url, requestInit, byteLength);
  // Compute & coalesce byte ranges for requested row groups
  const wantedRanges = rowGroupIndices.map(i => rowGroupByteRange(metadata, i));
  const coalesced = coalesceRanges(
    wantedRanges as [number, number][],
    /* merge tiny gaps? e.g. 4096 */ 0
  );

  // One multi-range (or fallback) to fetch all needed bytes
  const parts = await fetchMultiRangeOrFallback(
    url,
    coalesced as [number, number][],
    requestInit ?? {}
  );
  // Build file buffer backed by our cached byte segments
  const file = makeCachingAsyncBuffer({
    url,
    size,
    requestInit,
    cachedSegments: parts,
  });
  // Map row-group indices to absolute row windows
  const allBeforeCounts: number[] = [];
  let acc = 0;
  for (let i = 0; i < metadata.row_groups.length; i++) {
    allBeforeCounts.push(acc);
    acc += Number(metadata.row_groups[i].num_rows);
  }
  const starts = rowGroupIndices.map(i => allBeforeCounts[i]);
  const ends = rowGroupIndices.map(
    i => allBeforeCounts[i] + Number(metadata.row_groups[i].num_rows)
  );
  const rowStart = Math.min(...starts);
  const rowEnd = Math.max(...ends);
  const t8 = performance.now();
  // Read rows with compressors enabled
  const rows = await parquetReadObjects({
    file,
    columns,
    rowStart,
    rowEnd,
    compressors, // <-- applied here
  });
  const t9 = performance.now();
  console.log(`parquetReadObjects took ${t9 - t8}ms`);
  return {rows, metadata};
  const t10 = performance.now();
  // If non-contiguous groups requested, filter rows to only those groups
  if (rowGroupIndices.length > 1) {
    const allowed = rowGroupIndices
      .map(i => [allBeforeCounts[i], allBeforeCounts[i] + Number(metadata.row_groups[i].num_rows)])
      .sort((a, b) => a[0] - b[0]);

    let absRow = rowStart;
    const filtered = [];
    for (const r of rows) {
      let keep = false;
      for (const [s, e] of allowed) {
        if (absRow >= s && absRow < e) {
          keep = true;
          break;
        }
      }
      if (keep) filtered.push(r);
      absRow++;
    }
    return {rows: filtered, metadata};
  }
  const t11 = performance.now();
  console.log(`!!!filterRows took ${t11 - t10}ms`);
  return {rows, metadata};
}
