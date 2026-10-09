/**
 * Main-thread topology singleton for the topology-parquet prototype
 * (prototypes/topology-parquet/README.md). Inert unless the flag (./flag) is on.
 */
import ParquetWorker from '../ParquetWorker';
import type {DocumentObject} from '../api/apiHandlers/types';
import {TOPOLOGY_VARIANT, topologyBaseUrl} from './flag';
import type {Topology} from './types';

let base: string | null = null;
let loading: Promise<Topology | null> | null = null;
let topology: Topology | null = null;
/** Chunk loads in flight by parent idx. */
const inflight = new Map<number, Promise<void>>();
const listeners = new Set<(topo: Topology) => void>();
/** Latest ensureShattered call; earlier ones don't apply their set. */
let shatterRequest = 0;

const notify = (topo: Topology) => listeners.forEach(cb => cb(topo));

/** The loaded topology, or null (flag off, not loaded yet, or the map has no topology files). */
export const getTopology = () => topology;

/** Called with the topology once the base lands and after each shattered-set change. */
export const subscribeTopology = (cb: (topo: Topology) => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Directory URL of a document's topology files, or null when the flag is off. */
export const topologyBaseFor = (mapDocument?: DocumentObject | null) =>
  TOPOLOGY_VARIANT && mapDocument?.gerrydb_table
    ? topologyBaseUrl(mapDocument.gerrydb_table, TOPOLOGY_VARIANT)
    : null;

/**
 * Starts (or joins) the parents + exterior load for the document's map. Resolves null when the
 * flag is off or the files fail to load, so callers fall back to the current loaders.
 */
export const ensureTopology = (mapDocument?: DocumentObject | null): Promise<Topology | null> => {
  const url = topologyBaseFor(mapDocument);
  if (!url || !ParquetWorker) return Promise.resolve(null);
  if (url === base && loading) return loading;
  base = url;
  topology = null;
  inflight.clear();
  loading = ParquetWorker.loadTopologyBase(url).then(
    r => {
      if (base !== url) return null;
      topology = {
        ...r,
        chunks: new Map(),
        shattered: new Set(),
        unitByPath: new Map(r.parents.paths.map((path, i) => [path, i])),
        version: 0,
      };
      performance.mark('districtr:topology-base');
      notify(topology);
      return topology;
    },
    error => {
      console.error('Topology load failed; using the current loaders', error);
      return null;
    }
  );
  return loading;
};

/** Loads (or joins loads of) the shatter chunks of `parentPaths` without changing `shattered`. */
export const ensureChunks = async (
  mapDocument: DocumentObject | null | undefined,
  parentPaths: Iterable<string>
): Promise<{topo: Topology; parents: Set<number>} | null> => {
  const topo = await ensureTopology(mapDocument);
  if (!topo || topo !== topology || !ParquetWorker) return null;
  const parents = new Set<number>();
  for (const path of parentPaths) {
    const unit = topo.unitByPath.get(path);
    if (unit !== undefined && unit < topo.P) parents.add(unit);
  }
  const missing = Array.from(parents).filter(p => !topo.chunks.has(p) && !inflight.has(p));
  if (missing.length) {
    const request = ParquetWorker.loadTopologyChunks(base!, missing)
      .then(chunks => {
        for (const chunk of chunks) {
          topo.chunks.set(chunk.parent, chunk);
          const {paths, firstUnit} = chunk.children;
          for (let k = 0; k < paths.length; k++) topo.unitByPath.set(paths[k], firstUnit + k);
        }
      })
      .finally(() => missing.forEach(p => inflight.get(p) === request && inflight.delete(p)));
    missing.forEach(p => inflight.set(p, request));
  }
  await Promise.all(Array.from(parents, p => inflight.get(p)));
  return {topo, parents};
};

/**
 * Makes `parentPaths` the shattered set: fetches missing chunks, then (if no newer call came in)
 * sets `shattered`, bumps `version` and notifies. Resolves null when there is no topology.
 */
export const ensureShattered = async (
  mapDocument: DocumentObject | null | undefined,
  parentPaths: Iterable<string>
): Promise<Topology | null> => {
  const request = ++shatterRequest;
  const loaded = await ensureChunks(mapDocument, parentPaths);
  if (!loaded) return null;
  const {topo, parents} = loaded;
  if (request !== shatterRequest || topo !== topology) return topo;
  topo.shattered.clear();
  parents.forEach(p => topo.shattered.add(p));
  topo.version++;
  performance.mark('districtr:topology-ready', {detail: {shattered: parents.size}});
  notify(topo);
  return topo;
};
