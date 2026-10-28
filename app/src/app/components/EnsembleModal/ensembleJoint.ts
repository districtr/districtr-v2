import {formatElectionKey} from '@utils/elections';
import {formatEnsembleValue, type EnsembleMetricDef} from './ensembleMetrics';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import type {EnsembleDistribution, EnsembleJoint} from './ensembleTypes';

/**
 * Arithmetic over a pair's two-way bucket counts: the cells the density map
 * draws, and the conditional slice its sentence reports.
 *
 * A slice compares the plans that score best on X with the rest: if their Y
 * distributions match, the two goals are independent in the sample; if the
 * best-on-X plans have worse Y, the goals trade off; if better, they are
 * complementary. The sentence states the medians and their difference and
 * leaves the reading to the reader.
 */

type AxisKind = EnsembleDistribution['kind'];

/** One column (or row) of the counts. `from`/`to` are the values it spans;
 * `value` is the exact value of an integer or discrete column. */
export interface JointCell {
  from: number;
  to: number;
  value?: number;
}

/** An axis as drawn: its cells, and for each the source columns it sums. */
export interface JointAxis {
  kind: AxisKind;
  cells: JointCell[];
  /** `[first, last]` source column of each cell, inclusive. */
  sources: [number, number][];
}

/** The counts' own columns, one cell each. */
export const rawAxis = (kind: AxisKind, edges: number[], columns: number): JointAxis => {
  const cells: JointCell[] = [];
  for (let i = 0; i < columns; i++) {
    if (kind === 'continuous') {
      cells.push({from: edges[i], to: edges[i + 1] ?? edges[i]});
    } else if (kind === 'integer') {
      cells.push({from: edges[i] - 0.5, to: edges[i] + 0.5, value: edges[i]});
    } else {
      cells.push({from: edges[i], to: edges[i], value: edges[i]});
    }
  }
  return {kind, cells, sources: cells.map((_, i) => [i, i])};
};

/**
 * An integer axis with more values than `maxCells` is drawn in groups of
 * consecutive values, so a series such as block-level cut edges, with
 * thousands of distinct values, still reads as a density. Continuous axes
 * already hold 50 buckets and discrete ones a handful of values.
 */
export const displayAxis = (axis: JointAxis, maxCells: number): JointAxis => {
  if (axis.kind !== 'integer' || axis.cells.length <= maxCells) return axis;
  const size = Math.ceil(axis.cells.length / maxCells);
  const cells: JointCell[] = [];
  const sources: [number, number][] = [];
  for (let start = 0; start < axis.cells.length; start += size) {
    const end = Math.min(axis.cells.length, start + size) - 1;
    cells.push({from: axis.cells[start].from, to: axis.cells[end].to});
    sources.push([start, end]);
  }
  return {kind: axis.kind, cells, sources};
};

export interface JointGrid {
  x: JointAxis;
  y: JointAxis;
  /** `shares[row][column]`: share of all plans in the cell, 0 to 1. */
  shares: number[][];
  maxShare: number;
}

/** The density map's cells: counts summed into display cells, as shares. */
export const buildJointGrid = (joint: EnsembleJoint, maxCells: number): JointGrid | null => {
  const rows = joint.counts.length;
  const columns = joint.counts[0]?.length ?? 0;
  if (!rows || !columns) return null;
  const x = displayAxis(rawAxis(joint.x_kind, joint.x_edges, columns), maxCells);
  const y = displayAxis(rawAxis(joint.y_kind, joint.y_edges, rows), maxCells);
  const total = joint.counts.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0) || 1;
  let maxShare = 0;
  const shares = y.sources.map(([rowFrom, rowTo]) =>
    x.sources.map(([colFrom, colTo]) => {
      let count = 0;
      for (let r = rowFrom; r <= rowTo; r++) {
        for (let c = colFrom; c <= colTo; c++) count += joint.counts[r]?.[c] ?? 0;
      }
      const share = count / total;
      maxShare = Math.max(maxShare, share);
      return share;
    })
  );
  return {x, y, shares, maxShare};
};

/**
 * Position along an axis in the axis's own coordinate: the value itself on an
 * integer or continuous axis, a fractional column index on a discrete one
 * (whose columns are drawn evenly spaced). A value beyond a discrete axis's
 * ends continues at the spacing of the nearest two values, so a plan outside
 * everything the sample reached sits where its value belongs.
 */
export const axisCoordinate = (axis: JointAxis, value: number): number => {
  if (axis.kind !== 'discrete') return value;
  const values = axis.cells.map(cell => cell.value ?? cell.from);
  if (!values.length) return 0;
  const last = values.length - 1;
  const step = last > 0 ? values[last] - values[0] : 1;
  const spacing = (lower: number, upper: number) => (upper > lower ? upper - lower : step || 1);
  if (value <= values[0]) {
    return last > 0 ? (value - values[0]) / spacing(values[0], values[1]) : 0;
  }
  if (value >= values[last]) {
    return last + (last > 0 ? (value - values[last]) / spacing(values[last - 1], values[last]) : 0);
  }
  let i = 0;
  while (values[i + 1] < value) i += 1;
  return i + (value - values[i]) / (values[i + 1] - values[i]);
};

/** The coordinate span a cell occupies. */
export const cellSpan = (axis: JointAxis, index: number): [number, number] =>
  axis.kind === 'discrete'
    ? [index - 0.5, index + 0.5]
    : [axis.cells[index].from, axis.cells[index].to];

/** The cell holding a coordinate, or null outside the axis. */
export const cellAt = (axis: JointAxis, coordinate: number): number | null => {
  for (let i = 0; i < axis.cells.length; i++) {
    const [from, to] = cellSpan(axis, i);
    const last = i === axis.cells.length - 1;
    if (coordinate >= from && (coordinate < to || (last && coordinate <= to))) return i;
  }
  return null;
};

/** A cell's span in words: its exact value, or its range of values (the first
 * and last integer of a group of integer values). */
export const cellLabel = (
  axis: JointAxis,
  index: number,
  format: EnsembleMetricDef['format']
): string => {
  const cell = axis.cells[index];
  if (!cell) return '';
  if (cell.value !== undefined) return formatEnsembleValue(cell.value, format);
  const inset = axis.kind === 'integer' ? 0.5 : 0;
  return `${formatEnsembleValue(cell.from + inset, format)} to ${formatEnsembleValue(cell.to - inset, format)}`;
};

/** Which end of an X series counts as scoring best on it. */
export type SliceGoal = 'max' | 'min' | 'zero';

/** Proportionality-style scores are best at zero; counts of splits and cut
 * edges best when low; every other series best when high. */
export const sliceGoal = (metricId: string): SliceGoal => {
  switch (metricId) {
    case 'disproportionality':
    case 'efficiency_gap':
    case 'mean_median':
    case 'partisan_bias':
    case 'eguia':
      return 'zero';
    case 'county_splits':
    case 'county_pieces':
    case 'cut_edges':
      return 'min';
    default:
      return 'max';
  }
};

/** Median of a weighted histogram over the given cells: an exact value for
 * integer and discrete cells (the midpoint of two values when the halves split
 * between them), interpolated within its bucket for continuous ones. */
export const histogramMedian = (
  kind: AxisKind,
  cells: JointCell[],
  weights: number[]
): number | null => {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  const half = total / 2;
  let cumulative = 0;
  for (let i = 0; i < cells.length; i++) {
    const weight = weights[i] ?? 0;
    if (weight <= 0) continue;
    const before = cumulative;
    cumulative += weight;
    if (cumulative < half) continue;
    if (kind === 'continuous') {
      const fraction = (half - before) / weight;
      return cells[i].from + fraction * (cells[i].to - cells[i].from);
    }
    const value = cells[i].value ?? cells[i].from;
    if (cumulative === half) {
      const next = weights.findIndex((w, j) => j > i && w > 0);
      if (next >= 0) return (value + (cells[next].value ?? cells[next].from)) / 2;
    }
    return value;
  }
  return null;
};

export interface SliceResult {
  /** Share of all plans in the best-on-X group, near 0.1. */
  groupShare: number;
  groupMedian: number;
  restMedian: number;
  /** `groupMedian - restMedian`. */
  delta: number;
  /** The difference is within the resolution the counts allow. */
  same: boolean;
  n: number;
}

/** Share of plans the slice aims to hold: the top decile of X. */
export const SLICE_TARGET = 0.1;
/** The best-on-X group is a minority of the plans, or there is no slice. */
const SLICE_MAX_SHARE = 0.5;

/**
 * Splits the plans into those scoring best on X and the rest, and compares the
 * two medians of Y.
 *
 * The group is a run of whole X columns taken from the best end, the run whose
 * share of plans comes closest to a tenth, so every plan in a column falls on
 * one side and no assumption is made about Y within a column. Columns tied on
 * the goal (equally close to zero) join together. Returns null when the best
 * column alone holds half the plans or more, which leaves no tail to compare.
 */
export const sliceComparison = (joint: EnsembleJoint, goal: SliceGoal): SliceResult | null => {
  const rows = joint.counts.length;
  const columns = joint.counts[0]?.length ?? 0;
  if (!rows || !columns) return null;
  const x = rawAxis(joint.x_kind, joint.x_edges, columns);
  const y = rawAxis(joint.y_kind, joint.y_edges, rows);
  const columnTotals = Array.from({length: columns}, (_, c) =>
    joint.counts.reduce((sum, row) => sum + (row[c] ?? 0), 0)
  );
  const n = columnTotals.reduce((sum, count) => sum + count, 0);
  if (!n) return null;

  const centre = (cell: JointCell) => cell.value ?? (cell.from + cell.to) / 2;
  const key = (c: number) => {
    const value = centre(x.cells[c]);
    if (goal === 'max') return -value;
    if (goal === 'min') return value;
    return Math.abs(value);
  };
  const order = columnTotals
    .map((count, c) => ({c, count, key: key(c)}))
    .filter(column => column.count > 0)
    .sort((a, b) => a.key - b.key);

  // Whole groups of tied columns, best first.
  const steps: {columns: number[]; share: number}[] = [];
  let cumulative = 0;
  for (let i = 0; i < order.length; ) {
    const tied = [order[i]];
    while (i + tied.length < order.length && order[i + tied.length].key === order[i].key) {
      tied.push(order[i + tied.length]);
    }
    i += tied.length;
    cumulative += tied.reduce((sum, column) => sum + column.count, 0);
    const previous = steps.length ? steps[steps.length - 1].columns : [];
    steps.push({columns: [...previous, ...tied.map(column => column.c)], share: cumulative / n});
  }
  const candidates = steps.filter(step => step.share < SLICE_MAX_SHARE);
  if (!candidates.length) return null;
  const chosen = candidates.reduce((best, step) =>
    Math.abs(step.share - SLICE_TARGET) < Math.abs(best.share - SLICE_TARGET) ? step : best
  );

  const inGroup = new Set(chosen.columns);
  const groupWeights = joint.counts.map(row =>
    row.reduce((sum, count, c) => sum + (inGroup.has(c) ? count : 0), 0)
  );
  const restWeights = joint.counts.map(
    (row, r) => row.reduce((sum, count) => sum + count, 0) - groupWeights[r]
  );
  const groupMedian = histogramMedian(y.kind, y.cells, groupWeights);
  const restMedian = histogramMedian(y.kind, y.cells, restWeights);
  if (groupMedian === null || restMedian === null) return null;
  const delta = groupMedian - restMedian;
  const resolution =
    y.kind === 'continuous'
      ? (y.cells[0].to - y.cells[0].from) / 2
      : 1e-9 * Math.max(1, Math.abs(restMedian));
  return {
    groupShare: chosen.share,
    groupMedian,
    restMedian,
    delta,
    same: Math.abs(delta) <= resolution,
    n,
  };
};

const formatSliceValue = (value: number, format: EnsembleMetricDef['format']) =>
  format === 'count'
    ? value.toLocaleString(undefined, {maximumFractionDigits: 1})
    : formatEnsembleValue(value, format);

const formatSliceDelta = (delta: number, format: EnsembleMetricDef['format']) => {
  const size = Math.abs(delta);
  if (format === 'signed_pct') {
    return fillEnsembleText(ENSEMBLE_MODAL_TEXT.slicePoints, {delta: (size * 100).toFixed(1)});
  }
  if (format === 'decimal3') return size.toFixed(3);
  return size.toLocaleString(undefined, {maximumFractionDigits: 1});
};

const electionPhrase = (election?: string) =>
  election
    ? fillEnsembleText(ENSEMBLE_MODAL_TEXT.sliceElection, {election: formatElectionKey(election)})
    : '';

export interface SliceSentenceInput {
  result: SliceResult;
  preset: string;
  x: {def: EnsembleMetricDef; election?: string};
  y: {def: EnsembleMetricDef; election?: string};
}

/**
 * The slice in quotable form: the preset and plan count, the group by its
 * goal on X, its median on Y, and the difference from the rest's median.
 */
export const sliceSentence = ({result, preset, x, y}: SliceSentenceInput): string => {
  const text = ENSEMBLE_MODAL_TEXT;
  const percent = Math.round(result.groupShare * 100);
  const subject =
    percent === 10
      ? text.sliceTenth
      : fillEnsembleText(text.sliceShare, {
          share: `${percent >= 1 ? percent : (result.groupShare * 100).toFixed(1)}%`,
        });
  const groupPhrase = text.sliceGroups[x.def.id] ?? `with the highest ${x.def.label}`;
  const measureTemplate = text.sliceMeasures[y.def.id] ?? `have a median ${y.def.label} of {value}`;
  const measure =
    fillEnsembleText(measureTemplate, {value: formatSliceValue(result.groupMedian, y.def.format)}) +
    electionPhrase(y.election);
  const countLike = y.def.format === 'count';
  const comparison = result.same
    ? text.sliceSame
    : fillEnsembleText(
        result.delta > 0
          ? countLike
            ? text.sliceMore
            : text.sliceHigher
          : countLike
            ? text.sliceFewer
            : text.sliceLower,
        {delta: formatSliceDelta(result.delta, y.def.format)}
      );
  return fillEnsembleText(text.sliceSentence, {
    plans: result.n.toLocaleString(),
    preset,
    group: `${subject} ${groupPhrase}${electionPhrase(x.election)}`,
    measure,
    comparison,
  });
};
