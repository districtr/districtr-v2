/**
 * Topology-parquet loader timings in bun (prototypes/topology-parquet/README.md):
 *   bun src/app/utils/topology/decode.bench.ts <www/topology dir> <table> <variant>
 * Runs the worker loader phase by phase (parents, children demography, exterior arcs, child
 * labels, shatter chunks) for 170 random parents and for the 170 parents nearest Houston.
 * Bytes count footers and row-group reads (no cache). One variant per process so peak RSS is
 * the loader's.
 * (Phase 0 spike, removed with the list decoder: full TX arcs_exterior list<int32> xs/ys read +
 * decode ~190-205 ms median vs ~130-137 ms for the binary xy blob.)
 */
import {readFile} from 'fs/promises';
import {asyncBufferFromFile, parquetMetadataAsync} from 'hyparquet';
import {mercX, mercY} from './decode';
import {
  buildDemography,
  loadArcs,
  loadChildren,
  loadChunks,
  loadParents,
} from '../ParquetWorker/topology';
import type {TopologyIO} from '../ParquetWorker/topology';

const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(2);
/** Peak RSS so far (bun reports bytes). */
const peak = () => `peak RSS ${(process.resourceUsage().maxRSS / 2 ** 20).toFixed(0)} MB`;

const countingIO = () => {
  const stats = {bytes: 0, reads: 0};
  const io: TopologyIO = {
    whole: async url => {
      const buf = await readFile(url);
      stats.bytes += buf.byteLength;
      stats.reads++;
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    },
    ranged: async url => {
      const f = await asyncBufferFromFile(url);
      const file = {
        byteLength: f.byteLength,
        slice: (s: number, e = f.byteLength) => {
          stats.bytes += e - s;
          stats.reads++;
          return f.slice(s, e);
        },
      };
      const metadata = await parquetMetadataAsync(file);
      return {metadata, url, byteLength: f.byteLength, file};
    },
  };
  return {io, stats};
};

const loader = async (
  base: string,
  name: string,
  pick: (state: {parents: Float64Array; P: number; hasChildren: (p: number) => boolean}) => number[]
) => {
  const {io, stats} = countingIO();
  const phase = async <T>(label: string, fn: () => Promise<T>) => {
    const before = {...stats};
    const t = performance.now();
    const value = await fn();
    console.log(
      `  ${label}: ${(performance.now() - t).toFixed(0)} ms, ${mb(stats.bytes - before.bytes)} MB in ` +
        `${stats.reads - before.reads} reads`
    );
    return value;
  };
  console.log(`${name}:`);
  const state = await phase('parents', () => loadParents(io, base));
  const parents = pick({
    parents: state.parents!.label,
    P: state.P,
    hasChildren: p => state.childRowCount[p] > 1,
  });
  const paths = parents.map(p => state.parentPaths[p]);
  await phase(`children demography (${parents.length} parents, incl. footer)`, () =>
    loadChildren(state, parents, 'demography')
  );
  const t = performance.now();
  const demography = buildDemography(state, paths, 'vtd', 'block');
  console.log(
    `  demography table: ${(performance.now() - t).toFixed(0)} ms, ${demography.results.path.length} rows; ` +
      `ready at ${mb(stats.bytes)} MB total; ${peak()}`
  );
  const base_ = await phase('exterior arcs', () => loadArcs(state));
  await phase('child labels', () => loadChildren(state, parents, 'labels'));
  const chunks = await phase('chunks (rings + interior arcs, incl. footer)', () =>
    loadChunks(state, parents)
  );
  console.log(
    `  total ${mb(stats.bytes)} MB; E ${base_.E}, exterior vertices ${base_.exterior.offsets[base_.E]}; ` +
      `${chunks.reduce((n, c) => n + c.children.paths.length, 0)} children, ` +
      `${chunks.reduce((n, c) => n + c.interior.lengthM.length, 0)} interior arcs; ${peak()}`
  );
};

const main = async () => {
  const [root, table, variant] = process.argv.slice(2);
  const dir = `${root}/${variant}/${table}`;
  console.log(`## ${variant} / ${table}`);
  // Seeded shuffle so runs are comparable.
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  await loader(dir, 'random 170', ({P, hasChildren}) =>
    Array.from({length: P}, (_, p) => p)
      .filter(hasChildren)
      .sort(() => rand() - 0.5)
      .slice(0, 170)
  );
  const [hx, hy] = [mercX(-95.3698), mercY(29.7604)];
  await loader(dir, 'houston 170', ({parents: label, P, hasChildren}) => {
    const dist = (p: number) => (label[2 * p] - hx) ** 2 + (label[2 * p + 1] - hy) ** 2;
    return Array.from({length: P}, (_, p) => p)
      .filter(hasChildren)
      .sort((a, b) => dist(a) - dist(b))
      .slice(0, 170);
  });
  await loader(dir, 'unshattered', () => []);
};

main();
