import {PARQUET_URL} from '../api/constants';

/**
 * Prototype flag (prototypes/topology-parquet/README.md): localStorage.districtr_topology names
 * the variant directory ('full', 'simplified', 'coarse', ...). Main thread only, read once.
 */
const readVariant = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('districtr_topology') || null;
  } catch {
    return null;
  }
};

export const TOPOLOGY_VARIANT = readVariant();

export const TOPOLOGY_URL = process.env.NEXT_PUBLIC_TOPOLOGY_URL ?? PARQUET_URL;

/** Directory holding one map's topology files; file URLs are `${base}/${name}.parquet`. */
export const topologyBaseUrl = (gerrydbTable: string, variant: string) =>
  `${TOPOLOGY_URL}/topology/${variant}/${gerrydbTable}`;
