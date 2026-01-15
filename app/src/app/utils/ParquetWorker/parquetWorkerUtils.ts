import {AsyncBuffer} from 'hyparquet';

/** Cache entry storing a byte range and its data */
interface CacheEntry {
  start: number;
  end: number;
  u8: Uint8Array;
}

/** Options for enhancing AsyncBuffer with multi-range support */
export interface EnhanceAsyncBufferOptions {
  url: string;
  fetchInit?: RequestInit;
  maxPartsPerRequest?: number;
  maxGap?: number;
}

/** Extended AsyncBuffer with prefetch and cache capabilities */
export interface EnhancedAsyncBuffer extends AsyncBuffer {
  prefetch: (rangeGroups: Array<[number, number]>) => Promise<void>;
  _originalSlice: AsyncBuffer['slice'];
  _rangeCache: CacheEntry[];
}

/** A pending cache miss request */
interface PendingRequest {
  start: number;
  end: number;
  resolve: (value: ArrayBuffer) => void;
  reject: (reason: Error) => void;
}

/** Merged range group with associated pending requests */
interface MergedPendingGroup {
  start: number;
  end: number;
  parts: PendingRequest[];
}

/** Parsed multipart response part */
interface MultipartPart {
  start: number;
  end: number;
  payload: Uint8Array;
}

/**
 * Parse multipart/byteranges HTTP response body
 * @param arrayBuffer - The response body as ArrayBuffer
 * @param contentType - The Content-Type header value containing the boundary
 * @returns Array of parsed parts with byte ranges and payloads
 */
function parseMultipartByteRanges(arrayBuffer: ArrayBuffer, contentType: string): MultipartPart[] {
  const boundaryMatch = /boundary="?([^=";]+)"?/i.exec(contentType || '');
  if (!boundaryMatch) {
    throw new Error(`Missing boundary in Content-Type: ${contentType}`);
  }
  const boundary = boundaryMatch[1];

  const u8 = new Uint8Array(arrayBuffer);
  const enc = new TextEncoder();
  const dec = new TextDecoder('latin1');

  const dashBoundary = enc.encode(`--${boundary}`);
  const dashBoundaryEnd = enc.encode(`--${boundary}--`);
  const hdrSep = enc.encode('\r\n\r\n');
  const crlf = enc.encode('\r\n');

  function indexOfSeq(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
    outer: for (let i = from; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  const parts: MultipartPart[] = [];
  let pos = indexOfSeq(u8, dashBoundary, 0);
  if (pos === -1) {
    throw new Error('Boundary not found in multipart body');
  }

  while (pos !== -1) {
    const isFinal = indexOfSeq(u8, dashBoundaryEnd, pos) === pos;
    pos += dashBoundary.length;
    if (isFinal) break;

    // consume optional CRLF
    if (u8[pos] === crlf[0] && u8[pos + 1] === crlf[1]) pos += 2;

    const headerEnd = indexOfSeq(u8, hdrSep, pos);
    if (headerEnd === -1) {
      throw new Error('Missing header terminator in multipart');
    }
    const headerText = dec.decode(u8.subarray(pos, headerEnd));
    pos = headerEnd + hdrSep.length;

    const contentRangeMatch = /content-range:\s*bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(headerText);
    if (!contentRangeMatch) {
      throw new Error(`Missing Content-Range in part headers:\n${headerText}`);
    }
    const start = Number(contentRangeMatch[1]);
    const endInclusive = Number(contentRangeMatch[2]);

    const next = indexOfSeq(u8, dashBoundary, pos);
    if (next === -1) {
      throw new Error('Next boundary not found in multipart');
    }

    // trim trailing CRLF before boundary
    let bodyEnd = next;
    if (u8[bodyEnd - 2] === 13 && u8[bodyEnd - 1] === 10) bodyEnd -= 2;

    const payload = u8.subarray(pos, bodyEnd);
    parts.push({start, end: endInclusive + 1, payload}); // end exclusive
    pos = next;
  }

  return parts;
}

/**
 * Enhanced AsyncBuffer wrapper that adds:
 * - Multi-range prefetch via multipart/byteranges HTTP requests
 * - Cache-backed slice() for repeated reads
 * - Automatic fallback when server doesn't support multipart responses
 * - Opportunistic coalescing for cache misses
 *
 * @param file - The base AsyncBuffer to enhance
 * @param options - Configuration options
 * @returns Enhanced AsyncBuffer with prefetch capability
 */
export function enhanceAsyncBufferWithRangeGroups(
  file: AsyncBuffer,
  options: EnhanceAsyncBufferOptions
): EnhancedAsyncBuffer {
  const {url, fetchInit = {}, maxPartsPerRequest = 24, maxGap = 64 * 1024} = options;

  if (!url) {
    throw new Error('enhanceAsyncBufferWithRangeGroups requires url option');
  }

  const originalSlice = file.slice.bind(file);

  // ---- cache ----
  const cache: CacheEntry[] = [];

  const cacheGet = (start: number, end: number): Uint8Array | null => {
    for (const entry of cache) {
      if (start >= entry.start && end <= entry.end) {
        return entry.u8.subarray(start - entry.start, end - entry.start);
      }
    }
    return null;
  };

  const cachePut = (start: number, end: number, u8: Uint8Array): void => {
    if (end <= start) return;
    cache.push({start, end, u8});
    cache.sort((a, b) => a.start - b.start);
  };

  // ---- normalize/merge user ranges ----
  function normalizeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const [sRaw, eRaw] of ranges || []) {
      const s = Math.max(0, sRaw | 0);
      const e = Math.min(file.byteLength, eRaw | 0);
      if (e > s) out.push([s, e]);
    }
    out.sort((a, b) => a[0] - b[0]);

    // merge overlaps/adjacent
    const merged: Array<[number, number]> = [];
    for (const r of out) {
      const last = merged[merged.length - 1];
      if (!last || r[0] > last[1]) {
        merged.push(r);
      } else {
        last[1] = Math.max(last[1], r[1]);
      }
    }
    return merged;
  }

  // ---- multi-range fetch + cache seed ----
  async function fetchMultiRangesAndCache(ranges: Array<[number, number]>): Promise<void> {
    const norm = normalizeRanges(ranges);

    for (let i = 0; i < norm.length; i += maxPartsPerRequest) {
      const batch = norm.slice(i, i + maxPartsPerRequest);
      const rangeHeader = batch.map(([s, e]) => `${s}-${e - 1}`).join(',');

      const res = await fetch(url, {
        ...fetchInit,
        headers: {
          ...((fetchInit.headers as Record<string, string>) || {}),
          Range: `bytes=${rangeHeader}`,
        },
      });

      const ab = await res.arrayBuffer();
      const ct = res.headers.get('content-type') || '';

      if (res.status === 206 && /^multipart\/byteranges/i.test(ct)) {
        // Server returned multipart response with all requested ranges
        const parts = parseMultipartByteRanges(ab, ct);
        for (const p of parts) {
          cachePut(p.start, p.end, new Uint8Array(p.payload));
        }
      } else if (res.status === 206) {
        // Server returned a single range even though we asked for multiple.
        // Fall back: fetch each one individually using the underlying slice.
        await Promise.all(
          batch.map(async ([s, e]) => {
            const buf = await Promise.resolve(originalSlice(s, e));
            cachePut(s, e, new Uint8Array(buf));
          })
        );
      } else if (res.status === 200) {
        // Server ignored Range and returned whole file
        cachePut(0, file.byteLength, new Uint8Array(ab));
      } else {
        throw new Error(`Unexpected response status ${res.status}`);
      }
    }
  }

  // ---- opportunistic coalescing for misses (single-range via originalSlice) ----
  let pending: PendingRequest[] = [];
  let scheduled = false;

  async function flushMisses(): Promise<void> {
    scheduled = false;
    const reqs = pending;
    pending = [];

    reqs.sort((a, b) => a.start - b.start);
    const merged: MergedPendingGroup[] = [];

    for (const r of reqs) {
      const last = merged[merged.length - 1];
      if (!last || r.start > last.end + maxGap) {
        merged.push({start: r.start, end: r.end, parts: [r]});
      } else {
        last.end = Math.max(last.end, r.end);
        last.parts.push(r);
      }
    }

    await Promise.all(
      merged.map(async m => {
        const ab = await Promise.resolve(originalSlice(m.start, m.end));
        const u8 = new Uint8Array(ab);
        cachePut(m.start, m.end, u8);
        for (const p of m.parts) {
          const sub = u8.subarray(p.start - m.start, p.end - m.start);
          p.resolve(sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength));
        }
      })
    );
  }

  // ---- create enhanced buffer ----
  const enhancedFile = file as EnhancedAsyncBuffer;

  enhancedFile.prefetch = async (rangeGroups: Array<[number, number]>): Promise<void> => {
    await fetchMultiRangesAndCache(rangeGroups);
  };

  enhancedFile.slice = (
    start: number,
    end: number = file.byteLength
  ): ArrayBuffer | Promise<ArrayBuffer> => {
    start = Math.max(0, start | 0);
    end = Math.min(file.byteLength, end | 0);
    if (end <= start) return new ArrayBuffer(0);

    const hit = cacheGet(start, end);
    if (hit) {
      return hit.buffer.slice(hit.byteOffset, hit.byteOffset + hit.byteLength);
    }

    // miss: queue for coalesced single-range via originalSlice
    return new Promise<ArrayBuffer>((resolve, reject) => {
      pending.push({start, end, resolve, reject});
      if (!scheduled) {
        scheduled = true;
        setTimeout(() => {
          flushMisses().catch(e => {
            const leftovers = pending;
            pending = [];
            leftovers.forEach(r => r.reject(e));
          });
        }, 0);
      }
    });
  };

  enhancedFile._originalSlice = originalSlice;
  enhancedFile._rangeCache = cache;

  return enhancedFile;
}

/**
 * Calculate byte ranges for row groups from parquet metadata.
 * This enables prefetching the exact byte ranges needed before reading.
 *
 * @param metadata - Parquet file metadata
 * @param rowGroupIndices - Array of row group indices to get byte ranges for
 * @param columnIndices - Optional array of column indices to limit byte ranges (all columns if not provided)
 * @returns Array of [start, end] byte ranges covering the requested row groups
 */
export function getByteRangesForRowGroups(
  metadata: {
    row_groups: Array<{
      columns: Array<{
        meta_data?: {
          dictionary_page_offset?: bigint;
          data_page_offset?: bigint;
          total_compressed_size?: bigint;
        };
      }>;
    }>;
  },
  rowGroupIndices: number[],
  columnIndices?: number[]
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (const rgIndex of rowGroupIndices) {
    const rowGroup = metadata.row_groups[rgIndex];
    if (!rowGroup) continue;

    const columns = columnIndices
      ? columnIndices.map(i => rowGroup.columns[i]).filter(Boolean)
      : rowGroup.columns;

    for (const col of columns) {
      const meta = col.meta_data;
      if (!meta) continue;

      // Use dictionary_page_offset if available, otherwise data_page_offset
      const startOffset = meta.dictionary_page_offset ?? meta.data_page_offset;
      if (startOffset === undefined) continue;

      const start = Number(startOffset);
      const size = Number(meta.total_compressed_size ?? 0);
      if (size > 0) {
        ranges.push([start, start + size]);
      }
    }
  }

  return ranges;
}

/**
 * Merge overlapping or adjacent byte ranges to minimize HTTP requests.
 *
 * @param ranges - Array of [start, end] byte ranges
 * @param maxGap - Maximum gap between ranges to merge (default 64KB)
 * @returns Merged array of [start, end] byte ranges
 */
export function mergeByteRanges(
  ranges: Array<[number, number]>,
  maxGap = 64 * 1024
): Array<[number, number]> {
  if (ranges.length === 0) return [];

  // Normalize and sort
  const normalized = ranges
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];

  for (const [start, end] of normalized) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push([start, end]);
    } else if (start <= last[1] + maxGap) {
      // Merge if within gap threshold
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}
