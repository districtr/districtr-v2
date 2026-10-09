/**
 * Main-thread topology singleton for the topology-parquet prototype
 * (prototypes/topology-parquet/README.md). Inert unless the flag (./flag) is on.
 *
 * Demography comes first: parents, then the children demography columns of the parents asked
 * for. Arc loads (exterior, then children geometry + interior arcs) and child labels start only
 * once no demography load is pending, so they never compete with it for bandwidth.
 */
import ParquetWorker from '../ParquetWorker';
import type {DocumentObject} from '../api/apiHandlers/types';
import {TOPOLOGY_VARIANT, topologyBaseUrl} from './flag';
import type {Topology} from './types';

let base: string | null = null;
let parentsLoading: Promise<string | null> | null = null;
let arcsLoading: Promise<Topology | null> | null = null;
let topology: Topology | null = null;
/** Shatter chunk loads in flight by parent idx. */
const inflight = new Map<number, Promise<void>>();
const listeners = new Set<(topo: Topology) => void>();
/** Latest ensureShattered call; earlier ones don't apply their set. */
let shatterRequest = 0;
let demographyPending = 0;
let quietWaiters: Array<() => void> = [];

const notify = (topo: Topology) => listeners.forEach(cb => cb(topo));

/** Resolves once no demography load is pending. */
const quiet = () =>
  demographyPending === 0 ? Promise.resolve() : new Promise<void>(r => quietWaiters.push(r));

/** The topology once parents and exterior arcs are on the main thread, else null. */
export const getTopology = () => topology;

/** Called with the topology once the arcs land and after each shattered-set change. */
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
 * Starts (or joins) the parents load in the worker. Resolves the files' base URL, or null when
 * the flag is off or the load fails, so callers fall back to the current loaders.
 */
export const ensureBase = (mapDocument?: DocumentObject | null): Promise<string | null> => {
  const url = topologyBaseFor(mapDocument);
  if (!url || !ParquetWorker) return Promise.resolve(null);
  if (url === base && parentsLoading) return parentsLoading;
  base = url;
  topology = null;
  arcsLoading = null;
  inflight.clear();
  parentsLoading = ParquetWorker.loadTopologyParents(url).then(
    () => (base === url ? url : null),
    error => {
      console.error('Topology load failed; using the current loaders', error);
      return null;
    }
  );
  return parentsLoading;
};

/** Exterior arcs, after demography; builds the Topology once per base. */
const ensureArcs = (url: string): Promise<Topology | null> => {
  if (url !== base || !ParquetWorker) return Promise.resolve(null);
  const worker = ParquetWorker;
  arcsLoading ??= quiet()
    .then(() => worker.loadTopologyArcs(url))
    .then(
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
        console.error('Topology arcs failed to load', error);
        return null;
      }
    );
  return arcsLoading;
};

/**
 * Parents plus the children demography columns of `parentPaths`, in the worker: all that
 * demography needs. Resolves the base URL, or null (no topology). Kicks off the arc loads,
 * which wait until no call to this is pending.
 */
export const ensureDemography = async (
  mapDocument: DocumentObject | null | undefined,
  parentPaths: Iterable<string>
): Promise<string | null> => {
  // Counted before the first await, so calls made in one tick (load: the empty set from
  // setMapDocument, then the ingested one) all hold the arcs back.
  demographyPending++;
  const paths = Array.from(parentPaths);
  let url: string | null = null;
  try {
    url = await ensureBase(mapDocument);
    if (url && paths.length) await ParquetWorker!.loadTopologyChildren(url, paths, 'demography');
  } finally {
    if (--demographyPending === 0) {
      quietWaiters.forEach(r => r());
      quietWaiters = [];
    }
  }
  if (url) ensureArcs(url);
  return url;
};

/** ensureDemography, then (once demography is quiet) the children's label columns. */
export const ensureLabels = async (
  mapDocument: DocumentObject | null | undefined,
  parentPaths: Iterable<string>
): Promise<string | null> => {
  const paths = Array.from(parentPaths);
  const url = await ensureDemography(mapDocument, paths);
  if (!url) return null;
  await quiet();
  if (paths.length) await ParquetWorker!.loadTopologyChildren(url, paths, 'labels');
  return url;
};

/**
 * Makes `parentPaths` the shattered set: their demography, then (once demography is quiet) the
 * arcs and their shatter chunks; then, if no newer call came in, sets `shattered`, bumps
 * `version` and notifies. Resolves null when there is no topology.
 */
export const ensureShattered = async (
  mapDocument: DocumentObject | null | undefined,
  parentPaths: Iterable<string>
): Promise<Topology | null> => {
  const request = ++shatterRequest;
  const paths = Array.from(parentPaths);
  const url = await ensureDemography(mapDocument, paths);
  const topo = url && (await ensureArcs(url));
  if (!url || !topo || topo !== topology || !ParquetWorker) return null;
  const parents = new Set<number>();
  for (const path of paths) {
    const unit = topo.unitByPath.get(path);
    if (unit !== undefined && unit < topo.P) parents.add(unit);
  }
  await quiet();
  const missing = Array.from(parents).filter(p => !topo.chunks.has(p) && !inflight.has(p));
  if (missing.length) {
    const load = ParquetWorker.loadTopologyChunks(url, missing)
      .then(chunks => {
        for (const chunk of chunks) {
          topo.chunks.set(chunk.parent, chunk);
          const {paths, firstUnit} = chunk.children;
          for (let k = 0; k < paths.length; k++) topo.unitByPath.set(paths[k], firstUnit + k);
        }
      })
      .finally(() => missing.forEach(p => inflight.get(p) === load && inflight.delete(p)));
    missing.forEach(p => inflight.set(p, load));
  }
  await Promise.all(Array.from(parents, p => inflight.get(p)));
  if (request !== shatterRequest || topo !== topology) return topo;
  topo.shattered.clear();
  parents.forEach(p => topo.shattered.add(p));
  topo.version++;
  performance.mark('districtr:topology-ready', {detail: {shattered: parents.size}});
  notify(topo);
  return topo;
};
