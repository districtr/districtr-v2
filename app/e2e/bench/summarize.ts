/**
 * Re-print the benchmark summary table from saved per-run JSON files.
 *
 *   bun e2e/bench/summarize.ts <dir|file.json>... [--filter substring]
 */
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {printSummary} from './bench';

const argv = process.argv.slice(2);
const fi = argv.indexOf('--filter');
const filter = fi >= 0 ? argv[fi + 1] : '';
const inputs = argv.filter((a, i) => a !== '--filter' && i !== fi + 1);
const files = inputs.flatMap(p =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter(f => /_run\d+\.json$/.test(f))
        .map(f => join(p, f))
    : [p]
);
const rows = files
  .filter(f => !filter || f.includes(filter))
  .sort()
  .map(f => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>);
printSummary(rows);
