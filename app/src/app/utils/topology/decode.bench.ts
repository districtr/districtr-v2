/**
 * Topology-parquet loader timings in bun (prototypes/topology-parquet/README.md):
 *   bun src/app/utils/topology/decode.bench.ts <dir with {full,simplified}/<table>/> <table> <variant>
 * The worker loader end to end (base, then chunks for 170 random parents and for the 170 parents
 * nearest Houston), then the phase 0 spike: arcs_exterior (list<int32> xs/ys) vs
 * arcs_exterior_blob (binary xy) decode, plus parents. One variant per process so peak RSS is
 * the loader's.
 */
import {readFile} from 'fs/promises';
import {asyncBufferFromFile, parquetMetadata, parquetMetadataAsync} from 'hyparquet';
import {Columns, decodeArcBlobs, decodeArcLists, decodeParents, mercX, mercY} from './decode';
import {buildDemography, loadBase, loadChunks, readRowGroups} from '../ParquetWorker/topology';
import type {TopologyIO} from '../ParquetWorker/topology';

const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(1);
/** Peak RSS so far (bun reports bytes). */
const peak = () => `peak RSS ${mb(process.resourceUsage().maxRSS)} MB`;
const fmt = (ms: number[]) => {
  const s = [...ms].sort((a, b) => a - b);
  return `first ${ms[0].toFixed(1)} ms, median ${s[s.length >> 1].toFixed(1)} ms`;
};

const time = async <T>(fn: () => Promise<T> | T) => {
  const t = performance.now();
  const value = await fn();
  return {value, ms: performance.now() - t};
};

const readAll = async (path: string) => {
  const buf = await readFile(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const file = {byteLength: ab.byteLength, slice: (s: number, e?: number) => ab.slice(s, e)};
  const metadata = parquetMetadata(ab);
  return {file, metadata, bytes: ab.byteLength, n: Number(metadata.num_rows)};
};

const spike = async (dir: string, runs = 7) => {
  for (const name of ['arcs_exterior', 'arcs_exterior_blob', 'parents']) {
    const {file, metadata, bytes, n} = await readAll(`${dir}/${name}.parquet`);
    const read: number[] = [];
    const decode: number[] = [];
    let vertices = 0;
    for (let r = 0; r < runs; r++) {
      const cols = await time(() => readRowGroups(file, metadata));
      read.push(cols.ms);
      const c: Columns = cols.value;
      const d = await time(() => {
        if (name === 'parents') return decodeParents(c, n).refs.length;
        if (name === 'arcs_exterior_blob')
          return decodeArcBlobs(c.xy as ArrayLike<Uint8Array>, 0, n).offsets[n];
        return decodeArcLists(c.xs as number[][], c.ys as number[][], 0, n).offsets[n];
      });
      decode.push(d.ms);
      vertices = d.value;
    }
    console.log(
      `${name}: ${(bytes / 1024).toFixed(0)} KB, ${n} rows, ${vertices} ${name === 'parents' ? 'refs' : 'vertices'}\n` +
        `  hyparquet read ${fmt(read)}; decode ${fmt(decode)}; total ${fmt(read.map((t, i) => t + decode[i]))}`
    );
  }
};

const countingIO = () => {
  const stats = {bytes: 0, requests: 0};
  const io: TopologyIO = {
    whole: async url => {
      const {file, bytes} = await readAll(url);
      stats.bytes += bytes;
      stats.requests++;
      return file.slice(0);
    },
    ranged: async url => {
      const f = await asyncBufferFromFile(url);
      const file = {
        byteLength: f.byteLength,
        slice: (s: number, e = f.byteLength) => {
          stats.bytes += e - s;
          stats.requests++;
          return f.slice(s, e);
        },
      };
      const metadata = await parquetMetadataAsync(file);
      return {metadata, url, byteLength: f.byteLength, file};
    },
  };
  return {io, stats};
};

const typedBytes = (...objects: object[]) => {
  let n = 0;
  for (const o of objects)
    for (const v of Object.values(o)) if (ArrayBuffer.isView(v)) n += v.byteLength;
  return n;
};

const loader = async (base: string, nParents = 170) => {
  const {io, stats} = countingIO();
  const b = await time(() => loadBase(io, base));
  const {state, result} = b.value;
  await Promise.all([state.childrenFile, state.interiorFile]);
  console.log(
    `base: ${b.ms.toFixed(0)} ms (read+decode parents+exterior), ${(stats.bytes / 2 ** 20).toFixed(2)} MB ` +
      `incl. children/interior footers, ${stats.requests} reads; P ${result.P}, B ${result.B}, E ${result.E}, ` +
      `exterior vertices ${result.exterior.offsets[result.E]}; typed arrays ` +
      `${mb(typedBytes(result.parents, result.exterior))} MB; ${peak()}`
  );
  const withChildren = Array.from({length: result.P}, (_, p) => p).filter(
    p => result.parents.childRowCount[p] > 1
  );
  // Seeded shuffle so runs are comparable.
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const random = [...withChildren].sort(() => rand() - 0.5).slice(0, nParents);
  const [hx, hy] = [mercX(-95.3698), mercY(29.7604)];
  const label = result.parents.label;
  const dist = (p: number) => (label[2 * p] - hx) ** 2 + (label[2 * p + 1] - hy) ** 2;
  const houston = [...withChildren].sort((a, b) => dist(a) - dist(b)).slice(0, nParents);
  for (const [name, parents] of [
    ['random', random],
    ['houston', houston],
  ] as const) {
    const before = {...stats};
    const c = await time(() => loadChunks(state, parents));
    const children = c.value.reduce((n, s) => n + s.children.paths.length, 0);
    const arcs = c.value.reduce((n, s) => n + s.interior.lengthM.length, 0);
    const brokenIds = parents.map(p => result.parents.paths[p]);
    const d = await time(() => buildDemography(state, brokenIds, 'vtd', 'block'));
    console.log(
      `chunks ${name} (${parents.length} parents): ${c.ms.toFixed(0)} ms read+decode, ` +
        `${((stats.bytes - before.bytes) / 2 ** 20).toFixed(2)} MB in ${stats.requests - before.requests} reads; ` +
        `${children} children, ${arcs} interior arcs; typed arrays ` +
        `${mb(typedBytes(...c.value.flatMap(s => [s.children, s.interior])))} MB; ${peak()}; ` +
        `demography ${d.ms.toFixed(0)} ms, ${d.value.results.path.length} rows`
    );
  }
};

const main = async () => {
  const [root, table, variant] = process.argv.slice(2);
  const dir = `${root}/${variant}/${table}`;
  console.log(`## ${variant} / ${table}`);
  await loader(dir);
  await spike(dir);
};

main();
