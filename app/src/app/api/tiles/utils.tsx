import { Compression, ResolvedValueCache, FetchSource } from "pmtiles";

const PMTILES_ENDPOINT = process.env.NEXT_PUBLIC_S3_BUCKET_URL;
const sources: Record<string, FetchSource> = {};
export const CACHE = new ResolvedValueCache(25, undefined, nativeDecompress);

export async function nativeDecompress(
  buf: ArrayBuffer,
  compression: Compression
): Promise<ArrayBuffer> {
  if (compression === Compression.None || compression === Compression.Unknown) {
    return buf;
  }
  if (compression === Compression.Gzip) {
    const stream = new Response(buf).body;
    const result = stream?.pipeThrough(new DecompressionStream("gzip"));
    return new Response(result).arrayBuffer();
  }
  throw Error("Compression method not supported");
}


export const getSource = (name: string): FetchSource => {
  if (sources[name]) {
    return sources[name]!;
  }
  const s = new FetchSource(`${PMTILES_ENDPOINT}/${name}`);
  sources[name] = s;
  return s;
};
