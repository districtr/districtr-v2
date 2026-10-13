import type {EnsembleDistribution, EnsembleSummary} from '@utils/api/apiHandlers/getEnsemble';

/**
 * Where a plan's own metric values sit in an ensemble's distributions.
 *
 * Everything here is arithmetic over the bucket counts and quantile table of
 * `summary.json`; no per-plan data is downloaded and no adjacency is touched.
 */

/** Names one series of an ensemble summary — the unit of selection shared with the modal. */
export type EnsembleMetricRef =
  | {kind: 'election'; metric: ElectionMetric; election: string}
  | {kind: 'plan'; metric: PlanMetric}
  | {kind: 'compactness'; metric: CompactnessMetric; aggregate: CompactnessAggregate};

export type ElectionMetric =
  | 'seats'
  | 'efficiency_gap'
  | 'mean_median'
  | 'partisan_bias'
  | 'disproportionality'
  | 'eguia';

export type PlanMetric =
  | 'n_dem_districts'
  | 'n_rep_districts'
  | 'n_swing_districts'
  | 'n_competitive_contests'
  | 'county_splits'
  | 'county_pieces'
  | 'cut_edges';

export type CompactnessMetric = 'polsby_popper' | 'reock';
export type CompactnessAggregate = 'mean' | 'min' | 'max' | 'districts';

/** The distribution a reference names, or undefined when the package omits it. */
export const selectDistribution = (
  summary: EnsembleSummary,
  ref: EnsembleMetricRef
): EnsembleDistribution | undefined => {
  switch (ref.kind) {
    case 'election':
      return summary[ref.metric]?.[ref.election];
    case 'plan':
      return summary[ref.metric];
    case 'compactness':
      return summary[ref.metric]?.[ref.aggregate];
  }
};

const total = (distribution: EnsembleDistribution) =>
  distribution.counts.reduce((sum, count) => sum + count, 0);

/**
 * The share of ensemble plans whose value is strictly below `value`, and the
 * share strictly above it.
 *
 * An integer series is exact: bucket `i` holds the plans whose value is
 * `edges[i]`. A continuous series is read off the quantile table, which locates
 * a value far more finely than the 100 buckets do: entry `i` of the table is the
 * value at quantile `i / (length - 1)`. Between two neighbouring entries the
 * share is interpolated; where several entries hold the same value — a metric
 * that is continuous in dtype but lands on a few values in practice, such as
 * partisan bias — the plans sharing that value are counted as neither above nor
 * below, so the two shares deliberately sum to less than 1. Integer and
 * discrete series answer from their exact values, where a value within rounding
 * tolerance of the plan's counts as equal: the package keeps six significant
 * digits while the plan's value is unrounded.
 */
const EQUAL_TOLERANCE = 1e-5;
const sameValue = (a: number, b: number) =>
  Math.abs(a - b) <= EQUAL_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));

export const sharesAround = (
  distribution: EnsembleDistribution,
  value: number
): {below: number; above: number} => {
  const {quantiles} = distribution;
  if (distribution.kind === 'continuous' && quantiles && quantiles.length > 1) {
    const last = quantiles.length - 1;
    if (value < quantiles[0]) return {below: 0, above: 1};
    if (value > quantiles[last]) return {below: 1, above: 0};
    // Highest entry below the value and lowest entry above it; the entries
    // between them, if any, are all equal to it.
    let lower = -1;
    while (lower + 1 <= last && quantiles[lower + 1] < value) lower += 1;
    let upper = last + 1;
    while (upper - 1 >= 0 && quantiles[upper - 1] > value) upper -= 1;
    if (upper === lower + 1) {
      const span = quantiles[upper] - quantiles[lower];
      const fraction = span > 0 ? (value - quantiles[lower]) / span : 0;
      const position = (lower + fraction) / last;
      return {below: position, above: 1 - position};
    }
    return {below: (lower + 1) / last, above: (last - (upper - 1)) / last};
  }
  const count = total(distribution);
  if (!count) return {below: 0, above: 0};
  let below = 0;
  let above = 0;
  distribution.counts.forEach((plans, index) => {
    const bucketValue = distribution.edges[index];
    if (sameValue(bucketValue, value)) return;
    if (bucketValue < value) below += plans;
    else if (bucketValue > value) above += plans;
  });
  return {below: below / count, above: above / count};
};

/** How a plan's value compares with an ensemble, as the hover text states it. */
export interface EnsembleComparison {
  /** The ensemble's median, in the orientation the panel displays. */
  median: number;
  /**
   * Share of ensemble plans at least as far from the median as the plan, on the
   * plan's side of it, 0 to 1. Plans sharing the plan's value count. Near zero
   * means the plan is out in a tail few random plans reach.
   */
  extreme: number;
}

/**
 * `value` and the distribution are both in the package's own orientation
 * (Democratic point of view for partisan metrics); `display` is the panel's
 * transform for the median alone (a Republican-POV sign flip, or a Republican
 * seat count). The tail share is symmetric, so it needs no transform.
 */
export const compareToEnsemble = (
  distribution: EnsembleDistribution,
  value: number,
  options: {display?: (value: number) => number} = {}
): EnsembleComparison => {
  const {below, above} = sharesAround(distribution, value);
  const display = options.display ?? ((x: number) => x);
  const extreme = value <= distribution.median ? 1 - above : 1 - below;
  return {median: display(distribution.median), extreme};
};

/** Text colour for a tail share: the rarer the plan's position, the redder. */
export const extremeShareColor = (extreme: number): string | undefined => {
  if (extreme <= 0.05) return 'var(--red-11)';
  if (extreme <= 0.15) return 'var(--red-9)';
  if (extreme <= 0.3) return 'var(--orange-9)';
  return undefined;
};

/** A share of plans as a percentage, keeping a decimal where rounding would read as 0 or 100. */
export const formatShare = (share: number): string => {
  const percent = share * 100;
  if (percent >= 1 && percent <= 99) return `${percent.toFixed(0)}%`;
  return `${percent.toFixed(1)}%`;
};
