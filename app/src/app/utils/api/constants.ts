export const API_URL =
  typeof window === 'undefined'
    ? (process.env.NEXT_SERVER_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL;

export const FE_UNLOCK_DELAY = 30 * 1000;

export const TILESET_URL = process.env.NEXT_SERVER_S3_BUCKET_URL;
export const GEODATA_URL =
  process.env.NEXT_SERVER_S3_BUCKET_URL_MIRROR1 ?? process.env.NEXT_SERVER_S3_BUCKET_URL;
export const PARQUET_URL =
  process.env.NEXT_SERVER_S3_BUCKET_URL_MIRROR2 ?? process.env.NEXT_SERVER_S3_BUCKET_URL;
