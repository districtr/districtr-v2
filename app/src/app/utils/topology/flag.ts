import {PARQUET_URL} from '../api/constants';

/** Prototype flag (prototypes/topology-parquet/README.md); main thread only, read once. */
export type TopologyVariant = 'full' | 'simplified';

const readVariant = (): TopologyVariant | null => {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem('districtr_topology');
    return v === 'full' || v === 'simplified' ? v : null;
  } catch {
    return null;
  }
};

export const TOPOLOGY_VARIANT = readVariant();

export const TOPOLOGY_URL = process.env.NEXT_PUBLIC_TOPOLOGY_URL ?? PARQUET_URL;

/** Directory holding one map's topology files; file URLs are `${base}/${name}.parquet`. */
export const topologyBaseUrl = (gerrydbTable: string, variant: TopologyVariant) =>
  `${TOPOLOGY_URL}/topology/${variant}/${gerrydbTable}`;
