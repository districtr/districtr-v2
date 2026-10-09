/**
 * Map-load benchmark: loads the edit page of one or more documents in a fresh
 * browser (and context) per run and records load timing, bytes, main-thread
 * work, memory, brush (selection) latency and shatter latency.
 *
 *   e2e/bench/stack.sh servers && e2e/bench/stack.sh build && e2e/bench/stack.sh start
 *   node e2e/bench/bench.ts --docs 280,199 --runs 5 --network none,throttled [--variant full]
 *   node e2e/bench/bench.ts --summarize <results dir or json files...> [--filter substr]
 *
 * Run it with Node (>= 23, which runs .ts directly). Bun runs it too, but with
 * Playwright under Bun, browser.close() sometimes never resolves and Chrome
 * occasionally exits mid-run (~15% of runs here), so the numbers come from Node.
 *
 * A run that fails (e.g. the page never reaches demography-ready) is saved as
 * …_failedN.json with the page state, pending requests and a screenshot, and is
 * retried; the summary's `fail` column counts them.
 *
 * Document UUIDs (edit capabilities) are never written to disk: they come from
 * BENCH_DOC_<public_id> env vars or a query against the local postgres_db container,
 * and are redacted from the saved request log.
 *
 * Writes are never saved: the API goes through e2e/bench/api_proxy.py, which 403s
 * anything but GET/HEAD/OPTIONS (result.blockedWrites lists what it refused).
 *
 * Metrics (times are ms from navigation start, from performance marks or MapLibre
 * events recorded in the page; window.__districtrBench comes from
 * src/app/utils/bench/benchHook.ts, enabled by localStorage.districtr_bench = '1'):
 *   load.tAssignmentsIngested  mark districtr:assignments-ingested (useDocumentWithSync)
 *   load.tDemographyReady      first districtr:demography-ready whose detail.broken equals
 *                              the shattered-parent count in the assignments store
 *   load.tMapIdle              first MapLibre `idle` at/after that (idleSource
 *                              'already-idle' = nothing re-rendered for 3 s; then = demog)
 *   load.tPointsReady          last districtr:points-ready mark if any, else the last
 *                              *_points.parquet response end (tPointsFetched)
 *   load.tTopologyReady        districtr:topology-ready mark (prototype only)
 *   load.tLoaded               max(tMapIdle, tPointsReady, tTopologyReady)
 *   load.longTaskMs*           sum of main-thread long tasks (>50 ms) up to tLoaded / total
 *   load.jsHeapUsedMB          main-thread JS heap after a forced GC (workers excluded)
 *   load.process.renderer      per-process CPU seconds (SystemInfo.getProcessInfo) and
 *                              macOS phys_footprint; the page's renderer includes workers
 *   load.network               bytes (headers + encoded body) and request counts per
 *                              category (tabular, points, topology, pmtiles, api, other)
 *                              and per host/file; worker requests included
 *   brush                      N paintAt() calls (active paint function, synthetic event)
 *                              at seeded random canvas points: ms p50/p95, features/call
 *   shatter                    shatter() on the unshattered parent nearest the view
 *                              centre: ms to demography-ready with broken+1, to
 *                              topology-ready (prototype), to the next idle; bytes fetched
 */
import {chromium, type Browser, type CDPSession, type Page, type Request} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// ---------- args ----------
type Args = {
  docs: number[];
  runs: number;
  warmup: number;
  variant: string; // 'none' or a districtr_topology value
  networks: string[]; // 'none' | 'throttled'
  cpu: number; // CPU throttling rate, 1 = off
  base: string;
  api: string;
  out: string;
  headed: boolean;
  brushN: number;
  brushSize: number;
  shatter: boolean;
  timeoutMs: number;
  dpr: number;
  tag: string;
};

const HERE = dirname(fileURLToPath(import.meta.url));
/** <main checkout>/tmp/topology-bench, also from worktrees (BENCH_ROOT overrides). */
const BENCH_ROOT =
  process.env.BENCH_ROOT ??
  join(
    dirname(
      execFileSync('git', ['-C', HERE, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
        .toString()
        .trim()
    ),
    'tmp/topology-bench'
  );
const parseArgs = (argv: string[]): Args => {
  const get = (name: string, def: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  if (has('help')) {
    console.log(
      'node e2e/bench/bench.ts [--docs 280,199] [--runs 5] [--warmup 1] [--variant none|full|simplified]\n' +
        '  [--network none,throttled] [--cpu 1] [--base http://localhost:3200]\n' +
        '  [--api http://localhost:8010] [--out <dir>] [--headed] [--brush-n 200]\n' +
        '  [--brush-size 50] [--no-shatter] [--timeout 180000] [--dpr 1] [--tag label]\n' +
        'node e2e/bench/bench.ts --summarize <dir or files...> [--filter substr]'
    );
    process.exit(0);
  }
  return {
    docs: get('docs', '280,199').split(',').map(Number),
    runs: Number(get('runs', '5')),
    warmup: Number(get('warmup', '1')),
    variant: get('variant', 'none'),
    networks: get('network', 'none,throttled').split(','),
    cpu: Number(get('cpu', '1')),
    base: get('base', 'http://localhost:3200'),
    api: get('api', 'http://localhost:8010'),
    out: get('out', join(BENCH_ROOT, 'results')),
    headed: has('headed'),
    brushN: Number(get('brush-n', '200')),
    brushSize: Number(get('brush-size', '50')),
    shatter: !has('no-shatter'),
    timeoutMs: Number(get('timeout', '180000')),
    dpr: Number(get('dpr', '1')),
    tag: get('tag', ''),
  };
};

const THROTTLED = {
  offline: false,
  latency: 40,
  downloadThroughput: 5_000_000,
  uploadThroughput: 1_250_000,
};

const documentUuid = (publicId: number): string => {
  const fromEnv = process.env[`BENCH_DOC_${publicId}`];
  if (fromEnv) return fromEnv;
  const out = execFileSync('docker', [
    'exec',
    'postgres_db',
    'psql',
    '-U',
    'postgres',
    '-d',
    'districtr',
    '-At',
    '-c',
    `select document_id from document.document where public_id = ${Number(publicId)}`,
  ])
    .toString()
    .trim();
  if (!/^[0-9a-f-]{36}$/.test(out)) throw new Error(`No document for public_id ${publicId}`);
  return out;
};

// ---------- in-page types ----------
type StoreApi = {getState: () => any};
type Bench = {
  stores: {map: StoreApi; assignments: StoreApi; mapControls: StoreApi; demography: StoreApi};
  demographyService: {table?: {numRows: () => number}};
  getMapRef: () => any;
  ids: {source: string; parentHover: string; childHover: string};
  idle: number[];
  load: number[];
  attachedAt: number[];
  paintAt: (x: number, y: number, brushSize?: number) => number;
  shatter: (path: string) => Promise<{hadGeometry: boolean}>;
};
type BenchWindow = Window & {
  __districtrBench?: Bench;
  __benchLongTasks?: Array<[number, number]>;
};
type Mark = {name: string; t: number; detail: unknown};

// ---------- request accounting ----------
type Req = {
  url: string;
  method: string;
  status: number;
  type: string;
  bytes: number; // response headers + encoded body
  start: number; // epoch ms
  end: number; // epoch ms
  failed?: string;
};

const category = (url: string, api: string): string => {
  if (url.startsWith(api)) return 'api';
  const path = url.split('?')[0];
  if (path.includes('/topology/')) return 'topology';
  if (path.includes('/tabular/')) return 'tabular';
  if (path.endsWith('_points.parquet')) return 'points';
  if (path.endsWith('.pmtiles')) return 'pmtiles';
  return 'other';
};
/** Finer split: host + first path segment (+ file for parquet/pmtiles). */
const detailKey = (url: string): string => {
  if (/^(blob|data):/.test(url)) return url.slice(0, 5);
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    const file = segs[segs.length - 1] ?? '';
    const keep = /\.(pmtiles|parquet)$/.test(file) ? `/${segs[0]}/…/${file}` : `/${segs[0] ?? ''}`;
    return `${u.host}${keep}`;
  } catch {
    return url.slice(0, 60);
  }
};

const summarize = (reqs: Req[], api: string) => {
  const byCat: Record<string, {n: number; bytes: number}> = {};
  const byDetail: Record<string, {n: number; bytes: number}> = {};
  for (const r of reqs) {
    for (const [table, key] of [
      [byCat, category(r.url, api)],
      [byDetail, detailKey(r.url)],
    ] as const) {
      table[key] ??= {n: 0, bytes: 0};
      table[key].n += 1;
      table[key].bytes += r.bytes;
    }
  }
  return {byCat, byDetail, failed: reqs.filter(r => r.failed).length};
};
/** First request start / last response end per category, ms from navigation start. */
const phases = (reqs: Req[], api: string, rel: (t: number) => number) => {
  const out: Record<string, {firstStart: number; lastEnd: number}> = {};
  for (const r of reqs) {
    if (r.failed) continue;
    const c = category(r.url, api);
    const p = (out[c] ??= {firstStart: Infinity, lastEnd: -Infinity});
    p.firstStart = Math.min(p.firstStart, rel(r.start));
    p.lastEnd = Math.max(p.lastEnd, rel(r.end));
  }
  return out;
};

class RequestLog {
  reqs: Req[] = [];
  private pending = new Set<Promise<void>>();
  private started = new WeakMap<Request, number>();
  private inflight = 0;
  lastActivity = Date.now();
  constructor(page: Page) {
    page.on('request', req => {
      this.open.add(req);
      this.inflight++;
      this.lastActivity = Date.now();
      this.started.set(req, Date.now());
    });
    page.on('requestfinished', req => this.track(req));
    page.on('requestfailed', req => {
      const err = req.failure()?.errorText ?? 'failed';
      // Chrome reports every fetch(HEAD) as ERR_ABORTED (CDN too); they did complete.
      this.track(req, req.method() === 'HEAD' && err === 'net::ERR_ABORTED' ? undefined : err);
    });
  }
  private track(req: Request, failed?: string) {
    this.open.delete(req);
    this.inflight = Math.max(0, this.inflight - 1);
    this.lastActivity = Date.now();
    const doneAt = Date.now();
    const p = (async () => {
      const t = req.timing();
      let bytes = 0;
      let status = 0;
      if (!failed) {
        const sizes = await withTimeout(req.sizes(), 5000, null).catch(() => null);
        // HEAD: sizes() reports Content-Length as the body size; only headers crossed the wire.
        const body = req.method() === 'HEAD' ? 0 : Math.max(0, sizes?.responseBodySize ?? 0);
        bytes = body + Math.max(0, sizes?.responseHeadersSize ?? 0);
        status = (await withTimeout(req.response(), 5000, null).catch(() => null))?.status() ?? 0;
      }
      const start = t.startTime > 0 ? t.startTime : (this.started.get(req) ?? doneAt);
      this.reqs.push({
        url: req.url(),
        method: req.method(),
        status,
        type: req.resourceType(),
        bytes,
        start,
        end: t.startTime > 0 && t.responseEnd >= 0 ? t.startTime + t.responseEnd : doneAt,
        failed,
      });
    })();
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
  }
  get busy() {
    return this.inflight > 0;
  }
  private open = new Set<Request>();
  pendingUrls() {
    return [...this.open].map(r => `${r.method()} ${r.url()}`);
  }
  async flush() {
    await withTimeout(Promise.all([...this.pending]), 15_000, []);
  }
}

// ---------- helpers ----------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const withTimeout = <T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<F>(r => (timer = setTimeout(() => r(fallback), ms))),
  ]);
};
let runStartedAt = Date.now();
/** Progress line on stderr, so a stalled run shows where it stopped. */
const step = (what: string) =>
  process.stderr.write(`    ${((Date.now() - runStartedAt) / 1000).toFixed(1)}s ${what}\n`);
/** PID of the current run's browser process, so a hung run can be killed. */
let browserPid: number | null = null;
/** Playwright's temp profile dirs; a killed browser leaves its dir behind. */
const profileDirs = () =>
  new Set(readdirSync(tmpdir()).filter(f => f.startsWith('playwright_chromiumdev_profile-')));
let runProfileDirs: string[] = [];
// Under Bun, browser.close() sometimes never resolves (Chrome has exited); the
// close is then given up on after a few seconds and the process killed.
const killBrowser = () => {
  if (browserPid !== null) {
    try {
      process.kill(browserPid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  browserPid = null;
  for (const d of runProfileDirs) rmSync(join(tmpdir(), d), {recursive: true, force: true});
  runProfileDirs = [];
};
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const quantile = (xs: number[], q: number) => {
  const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
};
const median = (xs: number[]) => {
  const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const browserAlive = () => {
  if (browserPid === null) return true;
  try {
    process.kill(browserPid, 0);
    return true;
  } catch {
    return false;
  }
};
/** A dead browser can leave Playwright calls pending forever under Bun: bound each poll. */
const guard = async <T>(p: Promise<T>, what: string): Promise<T> => {
  const TIMEOUT = Symbol('timeout');
  const v = await withTimeout(p, 20_000, TIMEOUT);
  if (v === TIMEOUT) {
    throw new Error(browserAlive() ? `page call timed out (${what})` : `browser died (${what})`);
  }
  return v as T;
};

async function waitFor<T>(
  what: string,
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs: number,
  intervalMs = 100
): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await guard(fn(), what);
    if (v) return v as T;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(intervalMs);
  }
}

const getMarks = (page: Page): Promise<Mark[]> =>
  page.evaluate(() =>
    performance
      .getEntriesByType('mark')
      .filter(m => m.name.startsWith('districtr:'))
      .map(m => ({name: m.name, t: m.startTime, detail: (m as PerformanceMark).detail ?? null}))
  );

const getIdle = (page: Page): Promise<{idle: number[]; loaded: boolean; now: number}> =>
  page.evaluate(() => {
    const b = (window as BenchWindow).__districtrBench;
    const map = b?.getMapRef();
    return {idle: b?.idle.slice() ?? [], loaded: !!map?.loaded(), now: performance.now()};
  });

/** First idle at or after t; if the map was already idle and nothing re-rendered, t itself. */
async function idleAfter(page: Page, t: number, timeoutMs: number) {
  const t0 = Date.now();
  for (;;) {
    const s = await guard(getIdle(page), 'idle');
    const hit = s.idle.find(x => x >= t);
    if (hit !== undefined) return {t: hit, source: 'idle-event'};
    // No render was triggered after t: accept "already idle" once the map has stayed
    // loaded for 3 s past t.
    if (s.loaded && s.now - t > 3000) return {t, source: 'already-idle'};
    if (Date.now() - t0 > timeoutMs) return {t: NaN, source: 'timeout'};
    await sleep(100);
  }
}

async function processStats(browser: Browser) {
  const cdp = await browser.newBrowserCDPSession();
  const {processInfo} = (await cdp.send('SystemInfo.getProcessInfo')) as {
    processInfo: Array<{type: string; id: number; cpuTime: number}>;
  };
  await cdp.detach();
  const rssKb = (pid: number) => {
    try {
      return (
        Number(
          execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
            .toString()
            .trim()
        ) || 0
      );
    } catch {
      return 0;
    }
  };
  // macOS phys_footprint (what Activity Monitor calls "Memory"); includes worker heaps,
  // which live in the page's renderer process.
  const footprintMB = (pid: number) => {
    try {
      const out = execFileSync('footprint', ['-p', String(pid), '-f', 'bytes']).toString();
      return Number(/Footprint:\s*(\d+)\s*B/.exec(out)?.[1] ?? NaN) / 2 ** 20;
    } catch {
      return NaN;
    }
  };
  type Agg = {n: number; cpuS: number; rssMB: number; footprintMB: number; maxFootprintMB: number};
  const agg: Record<string, Agg> = {};
  for (const p of processInfo) {
    const k = p.type;
    const fp = k === 'renderer' || k === 'GPU' ? footprintMB(p.id) : NaN;
    agg[k] ??= {n: 0, cpuS: 0, rssMB: 0, footprintMB: 0, maxFootprintMB: 0};
    agg[k].n += 1;
    agg[k].cpuS += p.cpuTime;
    agg[k].rssMB += rssKb(p.id) / 1024;
    if (Number.isFinite(fp)) {
      agg[k].footprintMB += fp;
      agg[k].maxFootprintMB = Math.max(agg[k].maxFootprintMB, fp);
    }
  }
  return agg;
}

async function settle(page: Page, log: RequestLog, maxMs: number) {
  // Quiet = no request in flight or finished for 1.5 s and no long task in the last 1 s.
  const t0 = Date.now();
  for (;;) {
    const lastLong = await guard(
      page.evaluate(() => {
        const lt = (window as BenchWindow).__benchLongTasks ?? [];
        const last = lt[lt.length - 1];
        return {sinceLong: last ? performance.now() - (last[0] + last[1]) : 1e9};
      }),
      'settle'
    );
    if (!log.busy && Date.now() - log.lastActivity > 1500 && lastLong.sinceLong > 1000) return true;
    if (Date.now() - t0 > maxMs) return false;
    await sleep(200);
  }
}

// ---------- one run ----------
async function runOnce(args: Args, publicId: number, uuid: string, network: string, run: number) {
  runStartedAt = Date.now();
  step('launch');
  const dirsBefore = profileDirs();
  const browserLog: string[] = [];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !args.headed,
    timeout: 60_000,
    // Keep Chrome's own output so a browser that dies mid-run can be diagnosed.
    logger: {
      isEnabled: name => name === 'browser',
      log: (_name, _sev, message) => {
        browserLog.push(String(message).slice(0, 300));
        if (browserLog.length > 40) browserLog.shift();
      },
    },
  });
  {
    const cdp = await browser.newBrowserCDPSession();
    const {processInfo} = (await cdp.send('SystemInfo.getProcessInfo')) as {
      processInfo: Array<{type: string; id: number}>;
    };
    await cdp.detach();
    browserPid = processInfo.find(p => p.type === 'browser')?.id ?? null;
    runProfileDirs = [...profileDirs()].filter(d => !dirsBefore.has(d));
  }
  const result: Record<string, unknown> = {
    publicId,
    variant: args.variant,
    network,
    cpu: args.cpu,
    run,
    tag: args.tag,
    startedAt: new Date().toISOString(),
    browser: browser.version(),
  };
  // Hoisted so a failed run can still dump what it saw.
  let pageRef: Page | undefined;
  let logRef: RequestLog | undefined;
  const consoleErrors: Record<string, number> = {};
  let timeOrigin = 0;
  const rel = (epochMs: number) => epochMs - timeOrigin;
  const dumpRequests = () =>
    (logRef?.reqs ?? []).map(r => ({
      ...r,
      start: rel(r.start),
      end: rel(r.end),
      cat: category(r.url, args.api),
      url: r.url.replace(/private_edit_id=[^&]+/, 'private_edit_id=REDACTED').replace(uuid, 'UUID'),
    }));
  try {
    const context = await browser.newContext({
      viewport: {width: 1400, height: 900},
      deviceScaleFactor: args.dpr,
    });
    const origin = new URL(args.base).origin;
    await context.addInitScript(
      ({origin, variant}) => {
        if (location.origin !== origin) return;
        try {
          localStorage.setItem(
            'districtr_session',
            JSON.stringify({token: 'bench', expiresAt: Date.now() + 864e5})
          );
          localStorage.setItem('districtr_bench', '1');
          if (variant === 'none') localStorage.removeItem('districtr_topology');
          else localStorage.setItem('districtr_topology', variant);
        } catch {
          // storage unavailable
        }
        const w = window as BenchWindow;
        w.__benchLongTasks = [];
        try {
          new PerformanceObserver(list => {
            for (const e of list.getEntries()) w.__benchLongTasks!.push([e.startTime, e.duration]);
          }).observe({type: 'longtask', buffered: true});
        } catch {
          // longtask unsupported
        }
      },
      {origin, variant: args.variant}
    );
    const page = await context.newPage();
    pageRef = page;
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    // Never report bench sessions to Sentry (tunnelled through /monitoring) or analytics.
    await cdp.send('Network.setBlockedURLs', {
      urls: ['*/monitoring*', '*sentry.io*', '*analytics.ds.uchicago.edu*'],
    });
    if (network === 'throttled') await cdp.send('Network.emulateNetworkConditions', THROTTLED);
    if (args.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: args.cpu});
    const noteError = (text: string) => {
      const k = text.split('\n')[0].slice(0, 200);
      consoleErrors[k] = (consoleErrors[k] ?? 0) + 1;
    };
    page.on('console', m => m.type() === 'error' && noteError(m.text()));
    page.on('pageerror', e => noteError(`pageerror: ${e.message}`));
    const log = new RequestLog(page);
    logRef = log;
    await fetch(`${args.api}/__bench/blocked/reset`).catch(() => null);

    // ---- load ----
    const url = `${args.base}/map/${publicId}/edit?private_edit_id=${uuid}`;
    const wall0 = Date.now();
    step('goto');
    await page.goto(url, {waitUntil: 'commit', timeout: args.timeoutMs});
    timeOrigin = await page.evaluate(() => performance.timeOrigin);

    step('wait ingested');
    const ingested = await waitFor(
      'assignments-ingested',
      async () =>
        (await getMarks(page)).find(m => m.name === 'districtr:assignments-ingested') ?? null,
      args.timeoutMs
    );
    const expected = await page.evaluate(() => {
      const s = (window as BenchWindow).__districtrBench!.stores.assignments.getState();
      return {
        brokenParents: s.shatterIds.parents.size as number,
        children: s.shatterIds.children.size as number,
      };
    });
    step('wait demography');
    const demo = await waitFor(
      `demography-ready broken=${expected.brokenParents}`,
      async () =>
        (await getMarks(page)).find(
          m =>
            m.name === 'districtr:demography-ready' &&
            (m.detail as {broken?: number} | null)?.broken === expected.brokenParents
        ) ?? null,
      Math.max(1000, args.timeoutMs - (Date.now() - wall0))
    );
    const idle = await idleAfter(
      page,
      demo.t,
      Math.max(1000, args.timeoutMs - (Date.now() - wall0))
    );
    // Points/topology readiness: marks when present, else the points parquet response end.
    if (args.variant !== 'none') {
      await waitFor(
        'topology-ready',
        async () => (await getMarks(page)).find(m => m.name === 'districtr:topology-ready') ?? null,
        30_000
      ).catch(() => null);
    }
    step('settle');
    const settled = await settle(page, log, 30_000);
    await log.flush();
    const loadMarks = await getMarks(page);
    const loadReqs = log.reqs.slice();
    const pointsReqs = loadReqs.filter(r => category(r.url, args.api) === 'points' && !r.failed);
    const pointsFetchedEnd = pointsReqs.length ? Math.max(...pointsReqs.map(r => rel(r.end))) : NaN;
    const pointsMark = loadMarks.filter(m => m.name === 'districtr:points-ready');
    const topoReady = loadMarks.find(m => m.name === 'districtr:topology-ready');
    const tPoints = pointsMark.length ? Math.max(...pointsMark.map(m => m.t)) : pointsFetchedEnd;
    const tLoaded = Math.max(idle.t, Number.isFinite(tPoints) ? tPoints : 0, topoReady?.t ?? 0);
    const longTasks = await page.evaluate(() => (window as BenchWindow).__benchLongTasks ?? []);
    const ltUpTo = (t: number) =>
      longTasks.filter(([s]) => s <= t).reduce((acc, [, d]) => acc + d, 0);
    type Metrics = {metrics: Array<{name: string; value: number}>};
    const preGc = (await cdp.send('Performance.getMetrics')) as Metrics;
    await cdp.send('HeapProfiler.collectGarbage');
    const {metrics} = (await cdp.send('Performance.getMetrics')) as Metrics;
    const metric = (n: string, ms = metrics) => ms.find(m => m.name === n)?.value ?? NaN;
    const sanity = await page.evaluate(() => {
      const b = (window as BenchWindow).__districtrBench!;
      const a = b.stores.assignments.getState();
      const doc = b.stores.map.getState().mapDocument;
      const map = b.getMapRef();
      let childStateZoned = 0;
      let childStateMatches = 0;
      for (const child of a.shatterIds.children as Set<string>) {
        const fs = map?.getFeatureState({
          source: b.ids.source,
          sourceLayer: doc?.child_layer,
          id: child,
        });
        const z = a.zoneAssignments.get(child);
        if (fs?.zone !== undefined && fs?.zone !== null) childStateZoned++;
        if ((fs?.zone ?? null) === (z ?? null)) childStateMatches++;
      }
      let childrenAssigned = 0;
      for (const child of a.shatterIds.children as Set<string>) {
        if (a.zoneAssignments.get(child) != null) childrenAssigned++;
      }
      return {
        zoneAssignments: a.zoneAssignments.size as number,
        brokenParents: a.shatterIds.parents.size as number,
        children: a.shatterIds.children.size as number,
        childrenAssigned,
        childFeatureStateZoned: childStateZoned,
        childFeatureStateMatchesStore: childStateMatches,
        demographyRows: b.demographyService.table?.numRows() ?? null,
        paintByCounty: !!b.stores.mapControls.getState().mapOptions?.paintByCounty,
        zoom: map?.getZoom() ?? null,
        renderedChildFeatures:
          map?.queryRenderedFeatures(undefined, {layers: [b.ids.childHover]})?.length ?? null,
      };
    });
    step('process stats');
    const proc = await processStats(browser);
    result.load = {
      expected,
      marks: loadMarks,
      tAssignmentsIngested: ingested.t,
      tDemographyReady: demo.t,
      demographyDetail: demo.detail,
      tMapIdle: idle.t,
      idleSource: idle.source,
      tPointsFetched: pointsFetchedEnd,
      tPointsReady: tPoints,
      tTopologyReady: topoReady?.t ?? null,
      tLoaded,
      ...(await page.evaluate(() => {
        const b = (window as BenchWindow).__districtrBench;
        return {tMapAttached: b?.attachedAt[0] ?? null, tMapLoadEvent: b?.load[0] ?? null};
      })),
      phases: phases(loadReqs, args.api, rel),
      settled,
      longTaskMsToLoaded: ltUpTo(tLoaded),
      longTaskMsTotal: ltUpTo(Infinity),
      longTaskCount: longTasks.length,
      longestTaskMs: Math.max(0, ...longTasks.map(([, d]) => d)),
      jsHeapUsedMB: metric('JSHeapUsedSize') / 2 ** 20, // main thread, after a forced GC
      jsHeapUsedMBPreGc: metric('JSHeapUsedSize', preGc.metrics) / 2 ** 20,
      jsHeapTotalMB: metric('JSHeapTotalSize') / 2 ** 20,
      process: proc,
      network: summarize(loadReqs, args.api),
      sanity,
    };

    // ---- brush ----
    const rand = mulberry32(42);
    const view = await page.evaluate(() => {
      const c = (window as BenchWindow).__districtrBench!.getMapRef()?.getCanvas();
      return {w: c?.clientWidth ?? 0, h: c?.clientHeight ?? 0};
    });
    const m = args.brushSize;
    const pts = Array.from({length: args.brushN}, () => [
      m + rand() * Math.max(1, view.w - 2 * m),
      m + rand() * Math.max(1, view.h - 2 * m),
    ]);
    step('brush');
    const brush = await page.evaluate(
      ({pts, size}) => {
        const b = (window as BenchWindow).__districtrBench!;
        const out: Array<[number, number]> = [];
        for (const [x, y] of pts) {
          const t0 = performance.now();
          const n = b.paintAt(x, y, size);
          out.push([performance.now() - t0, n]);
        }
        return out;
      },
      {pts, size: args.brushSize}
    );
    const ms = brush.map(([d]) => d);
    const nf = brush.map(([, n]) => n);
    result.brush = {
      n: brush.length,
      brushSize: args.brushSize,
      viewport: view,
      p50: quantile(ms, 0.5),
      p95: quantile(ms, 0.95),
      max: Math.max(...ms),
      mean: ms.reduce((a, b) => a + b, 0) / ms.length,
      featuresMean: nf.reduce((a, b) => a + b, 0) / nf.length,
      featuresMedian: median(nf),
      zeroHits: nf.filter(n => n === 0).length,
    };

    // ---- shatter ----
    if (args.shatter) {
      step('shatter');
      const target = await page.evaluate(() => {
        const b = (window as BenchWindow).__districtrBench!;
        const map = b.getMapRef();
        const broken = b.stores.assignments.getState().shatterIds.parents as Set<string>;
        const c = map.getCanvas();
        const cx = c.clientWidth / 2;
        const cy = c.clientHeight / 2;
        for (let r = 0; r < Math.max(cx, cy); r += 10) {
          for (let k = 0; k < Math.max(1, Math.round((2 * Math.PI * r) / 10)); k++) {
            const a = (k / Math.max(1, Math.round((2 * Math.PI * r) / 10))) * 2 * Math.PI;
            const x = cx + r * Math.cos(a);
            const y = cy + r * Math.sin(a);
            const f = map.queryRenderedFeatures([x, y], {layers: [b.ids.parentHover]})?.[0];
            const path = f?.properties?.path ?? f?.id;
            if (path && !broken.has(String(path))) return {path: String(path), x, y};
          }
        }
        return null;
      });
      if (target) {
        const before = log.reqs.length;
        const wallBefore = Date.now();
        const t0 = await page.evaluate(() => performance.now());
        const shatterCall = await page.evaluate(
          path => (window as BenchWindow).__districtrBench!.shatter(path),
          target.path
        );
        const want = expected.brokenParents + 1;
        const sDemo = await waitFor(
          `shatter demography-ready broken=${want}`,
          async () =>
            (await getMarks(page)).find(
              m =>
                m.name === 'districtr:demography-ready' &&
                m.t > t0 &&
                (m.detail as {broken?: number} | null)?.broken === want
            ) ?? null,
          60_000
        ).catch(() => null);
        let sTopo: Mark | null = null;
        if (args.variant !== 'none') {
          sTopo = await waitFor(
            'shatter topology-ready',
            async () =>
              (await getMarks(page)).find(m => m.name === 'districtr:topology-ready' && m.t > t0) ??
              null,
            30_000
          ).catch(() => null);
        }
        const sIdle = await idleAfter(page, Math.max(sDemo?.t ?? t0, sTopo?.t ?? 0), 60_000);
        await settle(page, log, 20_000);
        await log.flush();
        const shatterReqs = log.reqs.slice(before).filter(r => r.start >= wallBefore - 50);
        const marks = (await getMarks(page)).filter(mk => mk.t > t0);
        const after = await page.evaluate(() => {
          const s = (window as BenchWindow).__districtrBench!.stores.assignments.getState();
          return {
            brokenParents: s.shatterIds.parents.size as number,
            children: s.shatterIds.children.size as number,
          };
        });
        result.shatter = {
          target: target.path,
          hadGeometry: shatterCall.hadGeometry,
          msToDemographyReady: sDemo ? sDemo.t - t0 : null,
          msToTopologyReady: sTopo ? sTopo.t - t0 : null,
          msToIdle: Number.isFinite(sIdle.t) ? sIdle.t - t0 : null,
          idleSource: sIdle.source,
          marks: marks.map(mk => ({...mk, t: mk.t - t0})),
          after,
          network: summarize(shatterReqs, args.api),
          phases: phases(shatterReqs, args.api, (x: number) => rel(x) - t0),
        };
      } else {
        result.shatter = {error: 'no unshattered parent found in view'};
      }
    }

    const blocked = await fetch(`${args.api}/__bench/blocked`)
      .then(r => r.json())
      .catch(() => null);
    result.blockedWrites = blocked;
    result.consoleErrors = consoleErrors;
    result.requests = dumpRequests();
  } catch (e) {
    result.error = String(e);
    result.browserLog = browserLog;
    step(`error: ${String(e).slice(0, 200)}`);
    // What the page looked like when it stalled (best effort).
    result.consoleErrors = consoleErrors;
    result.requests = dumpRequests();
    result.pending = logRef?.pendingUrls().map(u => u.replace(uuid, 'UUID'));
    const page = pageRef;
    if (page && browserAlive()) {
      result.failureState = await withTimeout(
        page
          .evaluate(() => {
            const b = (window as BenchWindow).__districtrBench;
            const m = b?.stores.map.getState();
            const map = b?.getMapRef();
            return {
              now: performance.now(),
              marks: performance
                .getEntriesByType('mark')
                .filter(x => x.name.startsWith('districtr:'))
                .map(x => ({name: x.name, t: x.startTime, detail: (x as PerformanceMark).detail})),
              appLoadingState: m?.appLoadingState,
              mapRenderingState: m?.mapRenderingState,
              loadingStates: m?.loadingStates,
              mapLock: m?.mapLock,
              notification: m?.notification?.message,
              demographyHash: b?.stores.demography.getState().dataHash?.slice(-60),
              mapLoaded: map?.loaded(),
              styleLoaded: map?.isStyleLoaded(),
              idle: b?.idle.length,
              broken: b?.stores.assignments.getState().shatterIds?.parents?.size,
              text: document.body.innerText.slice(0, 500),
            };
          })
          .catch(err => ({evaluateError: String(err)})),
        10_000,
        {evaluateError: 'timeout'}
      );
      await withTimeout(
        page.screenshot({path: join(args.out, `failure_${publicId}_${network}_${Date.now()}.png`)}),
        10_000,
        null
      ).catch(() => null);
    }
  } finally {
    step('close');
    if ((await withTimeout(browser.close(), 5_000, 'timeout')) === 'timeout') {
      step('close timed out; killed');
      killBrowser();
    }
    browserPid = null;
    runProfileDirs = [];
  }
  return result;
}

/** runOnce with a hard deadline; a hung run is recorded as an error and its browser killed. */
const runGuarded = async (...a: Parameters<typeof runOnce>): Promise<Record<string, unknown>> => {
  const deadline = a[0].timeoutMs + 240_000;
  const r = await withTimeout(runOnce(...a), deadline, null);
  if (r) return r;
  killBrowser();
  return {publicId: a[1], variant: a[0].variant, network: a[3], run: a[4], error: 'watchdog'};
};

// ---------- summary ----------
type Row = Record<string, unknown>;
const pick = (r: Row, path: string): number => {
  let v: unknown = r;
  for (const k of path.split('.')) v = (v as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'number' ? v : NaN;
};
const COLUMNS: Array<[string, string, (x: number) => string]> = [
  ['ingest', 'load.tAssignmentsIngested', x => (x / 1000).toFixed(2)],
  ['demog', 'load.tDemographyReady', x => (x / 1000).toFixed(2)],
  ['idle', 'load.tMapIdle', x => (x / 1000).toFixed(2)],
  ['points', 'load.tPointsReady', x => (x / 1000).toFixed(2)],
  ['loaded', 'load.tLoaded', x => (x / 1000).toFixed(2)],
  ['longT', 'load.longTaskMsToLoaded', x => (x / 1000).toFixed(2)],
  ['heapMB', 'load.jsHeapUsedMB', x => x.toFixed(0)],
  ['rendMB', 'load.process.renderer.maxFootprintMB', x => x.toFixed(0)],
  ['rendCPU', 'load.process.renderer.cpuS', x => x.toFixed(1)],
  ['tabMB', 'load.network.byCat.tabular.bytes', x => (x / 1e6).toFixed(1)],
  ['ptsMB', 'load.network.byCat.points.bytes', x => (x / 1e6).toFixed(1)],
  ['topoMB', 'load.network.byCat.topology.bytes', x => (x / 1e6).toFixed(1)],
  ['pmtMB', 'load.network.byCat.pmtiles.bytes', x => (x / 1e6).toFixed(1)],
  ['apiMB', 'load.network.byCat.api.bytes', x => (x / 1e6).toFixed(2)],
  ['brush50', 'brush.p50', x => x.toFixed(1)],
  ['brush95', 'brush.p95', x => x.toFixed(1)],
  ['feat', 'brush.featuresMean', x => x.toFixed(0)],
  ['shDemog', 'shatter.msToDemographyReady', x => (x / 1000).toFixed(2)],
  ['shIdle', 'shatter.msToIdle', x => (x / 1000).toFixed(2)],
  ['shMB', 'shatter.network.byCat.tabular.bytes', x => (x / 1e6).toFixed(2)],
];

export const printSummary = (rows: Row[]) => {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.publicId} ${r.variant} ${r.network}${Number(r.cpu) > 1 ? ` cpu${r.cpu}` : ''}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const header = ['group', 'n', 'fail', 'stat', ...COLUMNS.map(c => c[0])];
  const lines: string[][] = [header];
  for (const [k, rs] of groups) {
    const ok = rs.filter(r => !r.error);
    for (const [stat, f] of [
      ['med', median],
      ['p90', (xs: number[]) => quantile(xs, 0.9)],
    ] as const) {
      lines.push([
        k,
        String(ok.length),
        String(rs.length - ok.length),
        stat,
        ...COLUMNS.map(([, path, fmt]) => {
          const v = f(ok.map(r => pick(r, path)));
          return Number.isFinite(v) ? fmt(v) : '-';
        }),
      ]);
    }
  }
  const widths = header.map((_, i) => Math.max(...lines.map(l => l[i].length)));
  for (const l of lines) console.log(l.map((c, i) => c.padStart(widths[i])).join('  '));
  console.log(
    'times in s from navigation start; longT = long-task total to "loaded"; MB = bytes over the wire; brush in ms; shMB = tabular bytes fetched by the shatter'
  );
};

// ---------- main ----------
/** --summarize: re-print the table from saved per-run JSON files or directories. */
const summarizeFiles = (argv: string[]) => {
  const fi = argv.indexOf('--filter');
  const filter = fi >= 0 ? argv[fi + 1] : '';
  const inputs = argv.filter((a, i) => a !== '--summarize' && a !== '--filter' && i !== fi + 1);
  const files = inputs.flatMap(p =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter(f => /_run\d+(_failed\d+)?\.json$/.test(f))
          .map(f => join(p, f))
      : [p]
  );
  printSummary(
    files
      .filter(f => !filter || f.includes(filter))
      .sort()
      .map(f => JSON.parse(readFileSync(f, 'utf8')) as Row)
  );
};

const main = async () => {
  if (process.argv.includes('--summarize')) return summarizeFiles(process.argv.slice(2));
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rows: Row[] = [];
  for (const publicId of args.docs) {
    const uuid = documentUuid(publicId);
    for (const network of args.networks) {
      for (let w = 1; w <= args.warmup; w++) {
        const r = await runGuarded(args, publicId, uuid, network, 0);
        console.log(
          `[${publicId} ${args.variant} ${network} warmup${w}] ${r.error ? `ERROR ${r.error}` : 'ok'} (discarded)`
        );
      }
      // Collect `runs` successful runs; a failed attempt is saved (…_failedN.json) and retried.
      let run = 1;
      for (let attempt = 1; run <= args.runs && attempt <= args.runs + 3; attempt++) {
        const t = Date.now();
        const r = await runGuarded(args, publicId, uuid, network, run);
        const name = [
          stamp,
          publicId,
          args.variant,
          network,
          args.cpu > 1 ? `cpu${args.cpu}` : '',
          args.tag,
          `run${run}`,
          r.error ? `failed${attempt}` : '',
        ]
          .filter(Boolean)
          .join('_');
        writeFileSync(join(args.out, `${name}.json`), JSON.stringify(r, null, 1));
        rows.push(r);
        if (!r.error) run++;
        const load = r.load as Record<string, number> | undefined;
        console.log(
          `[${publicId} ${args.variant} ${network} run${r.error ? `${run} attempt ${attempt}` : run - 1}] ` +
            (r.error
              ? `ERROR ${r.error}`
              : `demog ${(load!.tDemographyReady / 1000).toFixed(2)}s idle ${(load!.tMapIdle / 1000).toFixed(2)}s loaded ${(load!.tLoaded / 1000).toFixed(2)}s`) +
            ` (${((Date.now() - t) / 1000).toFixed(0)}s wall)`
        );
      }
    }
  }
  writeFileSync(
    join(args.out, `${stamp}_summary.json`),
    JSON.stringify(
      rows.map(({requests: _r, ...rest}) => rest),
      null,
      1
    )
  );
  printSummary(rows);
};

// Exit explicitly: a browser.close() abandoned above keeps Bun's event loop alive.
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().then(
    () => process.exit(0),
    e => {
      console.error(e);
      killBrowser();
      process.exit(1);
    }
  );
}
