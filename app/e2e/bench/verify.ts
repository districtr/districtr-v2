/**
 * In-browser check of the topology prototype against the bench stack (stack.sh servers + start):
 * loads a doc with the flag on, checks demography rows and boundary arcs, paints one real
 * mouse stroke, and checks the store, feature-state and boundary diff. Screenshots go to
 * <BENCH_ROOT>/verify/. The API proxy blocks writes, so the stroke never reaches the DB.
 *
 *   node e2e/bench/verify.ts [--doc 280] [--variant full] [--base http://localhost:3200]
 */
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const doc = Number(arg('doc', '280'));
const variant = arg('variant', 'full');
const base = arg('base', 'http://localhost:3200');
const root =
  process.env.BENCH_ROOT ?? join(import.meta.dirname, '../../../../../../tmp/topology-bench');
const outDir = join(root, 'verify');
mkdirSync(outDir, {recursive: true});
const uuid =
  process.env[`BENCH_DOC_${doc}`] ??
  execFileSync('docker', [
    'exec',
    'postgres_db',
    'psql',
    '-U',
    'postgres',
    '-d',
    'districtr',
    '-At',
    '-c',
    `select document_id from document.document where public_id = ${doc}`,
  ])
    .toString()
    .trim();

const main = async () => {
  const browser = await chromium.launch({channel: 'chrome'});
  const context = await browser.newContext({viewport: {width: 1400, height: 900}});
  await context.addInitScript(v => {
    localStorage.setItem(
      'districtr_session',
      JSON.stringify({token: 'b', expiresAt: Date.now() + 864e5})
    );
    localStorage.setItem('districtr_bench', '1');
    if (v === 'none') localStorage.removeItem('districtr_topology');
    else localStorage.setItem('districtr_topology', v);
  }, variant);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/map/${doc}/edit?private_edit_id=${uuid}`);

  const failures: string[] = [];
  const check = (ok: boolean, msg: string) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (!ok) failures.push(msg);
  };
  const B = '(window.__districtrBench)';
  const idle = () =>
    page.evaluate(
      () => new Promise<void>(r => (window as any).__districtrBench.getMapRef().once('idle', r))
    );

  // Load: demography with every shattered parent, plus the topology's shattered set.
  await page.waitForFunction(`${B}?.stores.assignments.getState().shatterIds.parents.size >= 0`);
  await page.waitForFunction(
    `(() => { const n = ${B}.stores.assignments.getState().shatterIds.parents.size;
      return performance.getEntriesByName('districtr:demography-ready').some(m => m.detail.broken === n)
        && (${JSON.stringify(variant)} === 'none' ||
            performance.getEntriesByName('districtr:topology-ready').some(m => m.detail.shattered === n)); })()`,
    null,
    {timeout: 60_000}
  );
  const loaded = await page.evaluate(() => {
    const b = (window as any).__districtrBench;
    const s = b.stores.assignments.getState();
    const arcs = performance.getEntriesByName('districtr:topology-boundaries').at(-1) as any;
    return {
      broken: s.shatterIds.parents.size,
      children: s.shatterIds.children.size,
      assigned: s.zoneAssignments.size,
      rows: b.demographyService.table?.numRows(),
      arcs: arcs?.detail?.arcs ?? null,
    };
  });
  console.log(loaded);
  check(loaded.rows === 9068 - loaded.broken + loaded.children, `demography rows ${loaded.rows}`);
  if (variant !== 'none') check(loaded.arcs > 0, `boundary arcs ${loaded.arcs}`);
  await page.waitForTimeout(1500);
  await page.screenshot({path: join(outDir, `${doc}_${variant}_state.png`)});

  // Zoom to the first shattered parent's children and paint one stroke across the view.
  const target = await page.evaluate(() => {
    const b = (window as any).__districtrBench;
    const child = b.stores.assignments.getState().shatterIds.children.values().next().value;
    return child as string;
  });
  await page.evaluate(child => {
    const b = (window as any).__districtrBench;
    // Topology path: the block's label point. Flag off: central Houston.
    b.getMapRef().jumpTo({center: b.labelOf(child) ?? [-95.37, 29.76], zoom: 14});
  }, target);
  await idle();
  await page.waitForTimeout(1500);
  await page.screenshot({path: join(outDir, `${doc}_${variant}_zoom.png`)});

  const before = await page.evaluate(child => {
    const b = (window as any).__districtrBench;
    // A zone the target block isn't in, so the stroke repaints blocks.
    const n = b.stores.map.getState().mapDocument.num_districts;
    const z = ((b.stores.assignments.getState().zoneAssignments.get(child) ?? 0) % n) + 1;
    b.stores.mapControls.getState().setActiveTool('brush');
    b.stores.mapControls.getState().setSelectedZone(z);
    b.stores.mapControls.getState().setBrushSize(40);
    const m = b.stores.assignments.getState().zoneAssignments as Map<string, number | null>;
    return {z, zones: Object.fromEntries(m), t: performance.now()};
  }, target);
  const zone = before.z;
  const box = await page.evaluate(() => {
    const r = (window as any).__districtrBench.getMapRef().getCanvas().getBoundingClientRect();
    return {x: r.x, y: r.y, w: r.width, h: r.height};
  });
  const y = box.y + box.h / 2;
  await page.mouse.move(box.x + box.w * 0.25, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + box.w * (0.25 + (0.5 * i) / 20), y);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(
    ({z, before}) => {
      const b = (window as any).__districtrBench;
      const map = b.getMapRef();
      const doc = b.stores.map.getState().mapDocument;
      const s = b.stores.assignments.getState();
      const changed = [...s.zoneAssignments].filter(([id, v]) => v === z && before.zones[id] !== z);
      const children = changed.filter(([id]) => s.shatterIds.children.has(id)).length;
      const stateOk = changed.every(
        ([id]) =>
          map.getFeatureState({
            source: b.ids.source,
            sourceLayer: s.shatterIds.children.has(id) ? doc.child_layer : doc.parent_layer,
            id,
          }).zone === z
      );
      const diffs = (performance.getEntriesByName('districtr:topology-boundaries') as any[]).filter(
        m => m.startTime > before.t
      );
      const boundary = {
        arcs: diffs.at(-1)?.detail.arcs,
        add: diffs.reduce((n, m) => n + (m.detail.add ?? 0), 0),
        remove: diffs.reduce((n, m) => n + (m.detail.remove ?? 0), 0),
      };
      return {changed: changed.length, children, stateOk, boundary};
    },
    {z: zone, before}
  );
  console.log(after);
  check(after.changed > 0, `stroke painted ${after.changed} units (${after.children} blocks)`);
  check(after.stateOk, 'feature-state zone matches the store for every painted unit');
  if (variant !== 'none') {
    check(after.boundary.add + after.boundary.remove > 0, 'boundary diff after stroke');
  }
  await page.waitForTimeout(500);
  await page.screenshot({path: join(outDir, `${doc}_${variant}_painted.png`)});
  check(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ') || 'none'}`);
  await browser.close().catch(() => null);
  console.log(failures.length ? `${failures.length} FAILED` : 'all ok', `screenshots in ${outDir}`);
  process.exit(failures.length ? 1 : 0);
};
main();
