import type {DiagMetricInfo, DiagRange} from './diagTypes';

/** Index of the range file holding `step`. */
export const rangeIndexOf = (step: number, rangeSize: number): number =>
  Math.floor(step / rangeSize);

/** Position of `step` inside its range file. */
export const offsetInRange = (step: number, range: Pick<DiagRange, 'start'>): number =>
  step - range.start;

/** Decode a base64 string into bytes. */
export const decodeBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** The assignment row of `step`: `nNodes` values, one per node, in `nodes.json` order. */
export const decodeRow = (range: DiagRange, step: number, nNodes: number): Uint8Array => {
  const bytes = decodeBase64(range.assignments);
  const offset = offsetInRange(step, range);
  const rows = bytes.length / nNodes;
  if (!Number.isInteger(rows) || offset < 0 || offset >= rows) {
    throw new Error(`Step ${step} is outside this range file`);
  }
  return bytes.slice(offset * nNodes, (offset + 1) * nNodes);
};

/** Zone numbers 1..k from district labels that may be 0-based: the single place of that rule. */
export const toZones = (row: Uint8Array): number[] => {
  let min = Infinity;
  for (const v of row) if (v < min) min = v;
  const shift = min === 0 ? 1 : 0;
  return Array.from(row, v => v + shift);
};

/** `[unit id, zone]` pairs in the shape `uploadAssignments` takes (zone as string). */
export const assignmentPairs = (nodes: string[], row: Uint8Array): [string, string][] => {
  if (nodes.length !== row.length) {
    throw new Error(`Row has ${row.length} values for ${nodes.length} nodes`);
  }
  const zones = toZones(row);
  return nodes.map((id, i) => [id, String(zones[i])]);
};

/** Value of metric `key` at `step`, or undefined when the range lacks it. */
export const metricAt = (range: DiagRange, key: string, step: number): number | undefined =>
  range.metrics[key]?.[offsetInRange(step, range)];

/** Name of the document created for a step. */
export const diagDocumentName = (module: string, preset: string, step: number): string =>
  `diag ${module} ${preset} step ${step}`;

const electionYear = (text: string): number => {
  const m = text.match(/(\d{4}|\d{2})(?!.*\d)/);
  if (!m) return -1;
  const y = Number(m[1]);
  return m[1].length === 2 ? (y < 50 ? 2000 + y : 1900 + y) : y;
};

export interface HeadlineMetric {
  role: string;
  info: DiagMetricInfo;
}

const text = (m: DiagMetricInfo) => `${m.key} ${m.label}`.toLowerCase();

/**
 * Pick the headline columns from the catalogue by key. Roles absent from the
 * catalogue are omitted; the caller lists what matched.
 */
export const headlineMetrics = (metrics: DiagMetricInfo[]): HeadlineMetric[] => {
  const out: HeadlineMetric[] = [];
  const first = (role: string, pred: (m: DiagMetricInfo) => boolean) => {
    const info = metrics.find(pred);
    if (info) out.push({role, info});
  };
  first('County splits', m => /county.*split/.test(text(m)) && !/piece/.test(text(m)));
  first('County pieces', m => /county.*piece/.test(text(m)));
  first(
    'Subdivision splits',
    m => /(subdiv|municip|place|town|city).*split/.test(text(m)) && !/county/.test(text(m))
  );
  first('Polsby-Popper mean', m => /polsby|\bpp\b/.test(text(m)) && /mean|avg|average/.test(text(m)));
  const seats = metrics
    .filter(m => /seat/.test(text(m)) && /pres/.test(`${text(m)} ${m.election ?? ''}`.toLowerCase()))
    .sort(
      (a, b) =>
        electionYear(`${b.election ?? ''} ${b.key}`) - electionYear(`${a.election ?? ''} ${a.key}`)
    );
  if (seats[0]) out.push({role: 'Dem seats (latest presidential)', info: seats[0]});
  first('Cut edges', m => /cut.?edge/.test(text(m)));
  return out;
};
