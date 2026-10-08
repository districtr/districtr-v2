import {AsyncBuffer, FileMetaData} from 'hyparquet';

/** Bytes [start, end) of the file, found at offset in buffer */
interface Part {
  start: number;
  end: number;
  offset: number;
  buffer: ArrayBuffer;
}

// Bigger ranges are bandwidth-bound, so they get their own request. Also bounds
// each multipart response, which is held whole until the read finishes.
const MAX_BATCH_BYTES = 1 << 21; // 2mb

/** Urls whose server refused or ignored a multi-range request */
const singleRangeUrls = new Set<string>();

/**
 * Fetch byte ranges up front, batched into multi-range requests, and return an
 * AsyncBuffer that serves slices from them, falling back to file for anything
 * else. hyparquet 1.12 reads row groups one at a time, so this turns many
 * sequential round trips into a few parallel ones.
 *
 * Use the result for one read and drop it, it holds every fetched byte.
 * ponytail: replace with hyparquet's asyncBufferFromUrl maxRanges option once
 * it is released and we upgrade, its planner fetches row groups in parallel.
 *
 * @param file - Single range AsyncBuffer for url
 * @param url - The file url, for multi-range requests
 * @param ranges - [start, end) byte ranges to prefetch
 * @param maxRanges - Max ranges per request
 */
export async function prefetchAsyncBuffer(
  file: AsyncBuffer,
  url: string,
  ranges: Array<[number, number]>,
  maxRanges = 24
): Promise<AsyncBuffer> {
  const singles: Array<[number, number]> = [];
  const batches: Array<Array<[number, number]>> = [];
  let batch: Array<[number, number]> = [];
  let batchBytes = 0;
  for (const range of mergeByteRanges(ranges)) {
    const size = range[1] - range[0];
    if (size > MAX_BATCH_BYTES || singleRangeUrls.has(url)) {
      singles.push(range);
      continue;
    }
    if (batch.length === maxRanges || batchBytes + size > MAX_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(range);
    batchBytes += size;
  }
  if (batch.length) batches.push(batch);

  const parts = (
    await Promise.all([
      ...singles.map(range => slicePart(file, range)),
      ...batches.map(b => (b.length === 1 ? slicePart(file, b[0]) : fetchBatch(file, url, b))),
    ])
  ).flat();

  return {
    byteLength: file.byteLength,
    slice(start, end = file.byteLength) {
      const part = parts.find(p => p.start <= start && end <= p.end);
      if (!part) return file.slice(start, end);
      return part.buffer.slice(part.offset + start - part.start, part.offset + end - part.start);
    },
  };
}

async function slicePart(file: AsyncBuffer, [start, end]: [number, number]): Promise<Part> {
  return {start, end, offset: 0, buffer: await file.slice(start, end)};
}

/** One multi-range request, with single range requests for whatever it didn't return */
async function fetchBatch(
  file: AsyncBuffer,
  url: string,
  batch: Array<[number, number]>
): Promise<Part[]> {
  const res = await fetch(url, {
    headers: {Range: `bytes=${batch.map(([start, end]) => `${start}-${end - 1}`).join(',')}`},
  });
  const contentType = res.headers.get('Content-Type') ?? '';
  const contentRange = res.headers.get('Content-Range')?.match(/bytes (\d+)-(\d+)\//);
  let parts: Part[] = [];
  if (res.status === 206 && /^multipart\/byteranges/i.test(contentType)) {
    parts = parseMultipartRanges(await res.arrayBuffer());
  } else if (res.status === 206 && contentRange) {
    // server merged the ranges into one
    const start = Number(contentRange[1]);
    const end = Number(contentRange[2]) + 1;
    parts = [{start, end, offset: 0, buffer: await res.arrayBuffer()}];
  } else {
    // server refused the ranges (416, 400) or ignored them (200 with the
    // whole file), don't download the body
    res.body?.cancel();
  }
  const missing = batch.filter(
    ([start, end]) => !parts.some(p => p.start <= start && end <= p.end)
  );
  if (missing.length) singleRangeUrls.add(url);
  return parts.concat(await Promise.all(missing.map(range => slicePart(file, range))));
}

/**
 * Parse a multipart/byteranges body. Each part is located using the length
 * from its Content-Range header, so the boundary is not needed.
 */
export function parseMultipartRanges(buffer: ArrayBuffer): Part[] {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const parts: Part[] = [];
  let offset = 0;
  while (true) {
    // part headers end with \r\n\r\n
    let headerEnd = offset;
    while (
      headerEnd + 3 < bytes.length &&
      (bytes[headerEnd] !== 13 ||
        bytes[headerEnd + 1] !== 10 ||
        bytes[headerEnd + 2] !== 13 ||
        bytes[headerEnd + 3] !== 10)
    ) {
      headerEnd++;
    }
    const match = decoder
      .decode(bytes.subarray(offset, headerEnd))
      .match(/content-range:\s*bytes (\d+)-(\d+)\//i);
    if (!match) break; // closing boundary
    const start = Number(match[1]);
    const end = Number(match[2]) + 1;
    offset = headerEnd + 4;
    if (offset + end - start > bytes.length) break; // truncated
    parts.push({start, end, offset, buffer});
    offset += end - start;
  }
  return parts;
}

/**
 * Indices of the row groups whose min/max statistics for column contain at
 * least one of values.
 * ponytail: O(row groups × values), fine for the ~50 row groups of a state's
 * block points; sort values and binary search if it shows up in a profile.
 */
export function rowGroupsContaining(
  metadata: FileMetaData,
  column: string,
  values: string[]
): number[] {
  const columnIndex =
    metadata.row_groups[0]?.columns.findIndex(c => c.meta_data?.path_in_schema.includes(column)) ??
    -1;
  if (columnIndex === -1) throw new Error(`No ${column} column found`);
  const rowGroups: number[] = [];
  metadata.row_groups.forEach((rowGroup, i) => {
    const {min, max} = rowGroup.columns[columnIndex].meta_data?.statistics ?? {};
    if (min === undefined || max === undefined) throw new Error('No statistics found');
    if (values.some(value => min <= value && value <= max)) rowGroups.push(i);
  });
  return rowGroups;
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
