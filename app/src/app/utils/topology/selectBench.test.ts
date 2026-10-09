import {expect, test} from 'bun:test';
import {readFile} from 'fs/promises';
import {asyncBufferFromFile, parquetReadObjects} from 'hyparquet';
import {compressors} from 'hyparquet-compressors';
import {filterFeatures} from '@utils/map/filterFeatures';
import {boundaryArcs, boundaryDiff, unitAssignment} from './boundaries';
import {getIndexes} from './indexes';
import {selectUnits, unitFeature} from './select';
import {loadTopologyDir} from './testTopology';

// Local-only microbench: TOPOLOGY_BENCH=<repo>/tmp/topology-bench with
// www/topology/{variant}/tx_districtr_view_v2 and fixtures/plan_280.csv (geo_id,zone of the
// dev DB's public_id 280 plan). TOPOLOGY_VARIANT picks the variant (default full).
const BENCH = process.env.TOPOLOGY_BENCH;
const VARIANT = process.env.TOPOLOGY_VARIANT ?? 'full';
const DIR = `${BENCH}/www/topology/${VARIANT}/tx_districtr_view_v2`;

const stats = (ms: number[]) => {
  const s = [...ms].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(3);
  return `p50 ${at(0.5)} p95 ${at(0.95)} max ${s[s.length - 1].toFixed(3)} ms (n=${s.length})`;
};

const time = <T>(f: () => T): [T, number] => {
  const t0 = performance.now();
  const out = f();
  return [out, performance.now() - t0];
};

test.skipIf(!BENCH)(
  `selection + boundaries microbench (${VARIANT} TX)`,
  async () => {
    const plan = new Map<string, number | null>();
    for (const line of (await readFile(`${BENCH}/fixtures/plan_280.csv`, 'utf8')).split('\n')) {
      const [path, zone] = line.split(',');
      if (path) plan.set(path, zone ? Number(zone) : null);
    }
    const children = await parquetReadObjects({
      file: await asyncBufferFromFile(`${DIR}/children.parquet`),
      columns: ['path', 'parent_idx'],
      compressors,
    });
    const shattered = new Set<number>();
    for (const {path, parent_idx} of children) if (plan.has(path)) shattered.add(parent_idx);
    const t0 = performance.now();
    const topo = await loadTopologyDir(DIR, [...shattered]);
    const loadMs = performance.now() - t0;
    const log = [`${VARIANT}: P ${topo.P} B ${topo.B} E ${topo.E}, ${shattered.size} shattered`];

    const [, firstMs] = time(() => getIndexes(topo));
    log.push(`indexes, first build incl. exterior (${topo.E} arcs): ${firstMs.toFixed(1)} ms`);
    const rebuilds = Array.from({length: 20}, () => {
      topo.version++;
      return getIndexes(topo).rebuildMs;
    });
    const idx = getIndexes(topo);
    log.push(
      `index rebuild (${idx.interior?.index.numItems} interior arcs, ` +
        `${idx.units.index.numItems} active units): ${stats(rebuilds)}`
    );

    // Brush centers: label points of active units, half of them blocks of shattered parents.
    const labels: number[] = [];
    const active = [topo.parents, ...[...shattered].map(p => topo.chunks.get(p)!.children)];
    for (let i = 0; i < 4000; i++) {
      const chunk =
        i % 2 ? topo.parents : active[1 + Math.floor(Math.random() * (active.length - 1))];
      const k = Math.floor(Math.random() * chunk.paths.length);
      labels.push(chunk.label[2 * k], chunk.label[2 * k + 1]);
    }
    const run = (px: number, zoom: number, capsule: boolean, withFeatures: boolean) => {
      const r = px / (512 * 2 ** zoom);
      const ms: number[] = [];
      let hits = 0;
      for (let i = 0; i < labels.length / 2; i++) {
        const [x, y] = [labels[2 * i], labels[2 * i + 1]];
        // A drag step of 2 brush radii.
        const [qx, qy] = capsule ? [x + 2 * r, y + r] : [x, y];
        const t0 = performance.now();
        const units = selectUnits(topo, x, y, qx, qy, r);
        if (withFeatures) {
          const features = [...units].map(u => unitFeature(topo, u, 'vtd', 'block')!);
          filterFeatures({_features: features});
        }
        ms.push(performance.now() - t0);
        hits += units.size;
      }
      return {ms, hits: hits / (labels.length / 2)};
    };
    run(20, 12, false, true); // warm-up
    for (const [px, zoom] of [
      [20, 10],
      [20, 12],
      [50, 12],
      [20, 14],
      [100, 9],
    ]) {
      for (const capsule of [false, true]) {
        const core = run(px, zoom, capsule, false);
        const full = run(px, zoom, capsule, true);
        log.push(
          `${capsule ? 'capsule' : 'disk   '} ${px}px z${zoom}: ${core.hits.toFixed(1)} units/event; ` +
            `selectUnits ${stats(core.ms)}; +features+filterFeatures ${stats(full.ms)}`
        );
      }
    }

    const [assignment, assignMs] = time(() => unitAssignment(topo, plan));
    const [arcs, arcsMs] = time(() => boundaryArcs(topo, assignment));
    const [initial, initialMs] = time(() => boundaryDiff(topo, new Set(), arcs));
    log.push(
      `boundaries for plan 280 (${plan.size} assignments): unitAssignment ${assignMs.toFixed(1)} ms, ` +
        `boundaryArcs ${arcsMs.toFixed(1)} ms (${arcs.size} arcs), ` +
        `initial diff ${initialMs.toFixed(1)} ms (${initial.add?.length} features)`
    );
    // A committed gesture: ~200 units under one stroke change zone, then full recompute + diff.
    const recompute: number[] = [];
    let prev = arcs;
    const zones = new Map(plan);
    const paths = [...zones.keys()];
    for (let g = 0; g < 10; g++) {
      const start = Math.floor(Math.random() * (paths.length - 200));
      for (let i = start; i < start + 200; i++) zones.set(paths[i], (g % 5) + 1);
      const [next, ms] = time(() => {
        const n = boundaryArcs(topo, unitAssignment(topo, zones));
        boundaryDiff(topo, prev, n);
        return n;
      });
      prev = next;
      recompute.push(ms);
    }
    log.push(`boundary recompute + diff after a 200-unit gesture: ${stats(recompute)}`);
    log.push(
      `(topology load from local disk incl. ${shattered.size} chunks: ${loadMs.toFixed(0)} ms)`
    );
    console.log(log.join('\n'));
    expect(arcs.size).toBeGreaterThan(0);
  },
  600_000
);
