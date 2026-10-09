import {describe, expect, test} from 'bun:test';
import {readFile} from 'fs/promises';
import {area} from '@turf/turf';
import {unitPath} from './access';
import {selectUnits, unitGeometry} from './select';
import {loadTopologyDir} from './testTopology';

// Local-only: TOPOLOGY_BENCH=<repo>/tmp/topology-bench, holding www/topology/{variant}/NAME and
// fixtures/selection_NAME.json from prototypes/topology-parquet/selection_fixture.py.
const BENCH = process.env.TOPOLOGY_BENCH;
const NAME = process.env.TOPOLOGY_FIXTURE_MAP ?? 'tx_county_test';

interface Fixture {
  shattered: number[];
  cases: {p: [number, number]; q: [number, number]; r: number; expect: string[]; ties: string[]}[];
}

describe.skipIf(!BENCH)('selectUnits against shapely', () => {
  for (const variant of ['full', 'simplified']) {
    test(variant, async () => {
      const fixture: Fixture = JSON.parse(
        await readFile(`${BENCH}/fixtures/selection_${NAME}.json`, 'utf8')
      );
      const topo = await loadTopologyDir(
        `${BENCH}/www/topology/${variant}/${NAME}`,
        fixture.shattered
      );
      const mismatches = fixture.cases.flatMap(({p, q, r, expect: want, ties}, i) => {
        const got = new Set(Array.from(selectUnits(topo, ...p, ...q, r), u => unitPath(topo, u)));
        const ignore = new Set(ties);
        const extra = [...got].filter(path => !want.includes(path!) && !ignore.has(path!));
        const missing = want.filter(path => !got.has(path) && !ignore.has(path));
        return extra.length || missing.length ? [{i, r, extra, missing}] : [];
      });
      const hits = fixture.cases.reduce((n, c) => n + c.expect.length, 0);
      console.log(
        `${variant}: ${mismatches.length}/${fixture.cases.length} cases differ ` +
          `(${mismatches.reduce((n, m) => n + m.extra.length + m.missing.length, 0)} of ${hits} unit hits)`,
        mismatches.slice(0, 5)
      );
      if (variant !== 'full') return;
      expect(mismatches).toEqual([]);
      // Ring walks (the paint-constraint geometry) reproduce the geodesic areas.
      const chunks = [topo.parents, ...Array.from(topo.chunks.values(), c => c.children)];
      const off = chunks.flatMap(chunk =>
        chunk.paths.filter((_, k) => {
          const got = area(unitGeometry(topo, chunk, k));
          return Math.abs(got - chunk.areaM2[k]) > 0.01 * chunk.areaM2[k] + 1;
        })
      );
      expect(off).toEqual([]);
    });
  }
});
