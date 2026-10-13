'use client';
import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import type {EnsembleDistribution, EnsembleSegmentStep, EnsembleSummary} from './ensembleTypes';

export type EnsembleCategory = 'partisan' | 'competitiveness' | 'splits' | 'compactness';

/** Which series the histogram shows. `election` is set exactly for the
 * per-election metrics of the partisan category. */
export interface EnsembleMetricFocus {
  category: EnsembleCategory;
  metric: string;
  election?: string;
}

export type EnsembleValueFormat = 'signed_pct' | 'count' | 'decimal3';

export interface EnsembleMetricDef {
  id: string;
  label: string;
  category: EnsembleCategory;
  perElection: boolean;
  format: EnsembleValueFormat;
  distribution: (summary: EnsembleSummary, election?: string) => EnsembleDistribution | undefined;
  /** The value for the plan the user is editing, from the evaluation endpoint. */
  planValue: (evaluation: DocumentEvaluation, election?: string) => number | undefined;
  /** The value for one plan of the demonstration segment. */
  stepValue: (step: EnsembleSegmentStep, election?: string) => number | undefined;
}

export const CATEGORY_LABELS: Record<EnsembleCategory, string> = {
  partisan: 'Partisanship',
  competitiveness: 'Competitiveness',
  splits: 'County splits',
  compactness: 'Compactness',
};

/** gerrytools' CompetitiveContests margin, the one the ensemble was scored
 * with: a contest counts when the Democratic two-party share is strictly
 * within this much of 50%. The evaluation panel lets the reader widen its own
 * band; the comparison here is fixed to the band the ensemble used. */
const COMPETITIVE_MARGIN = 0.03;

const countCompetitiveContests = (shares: number[]) =>
  shares.filter(share => Math.abs(share - 0.5) < COMPETITIVE_MARGIN).length;

/** Mirrors `RegionSplits`: counties touching more than one district. */
const planCountySplits = (evaluation: DocumentEvaluation) => {
  const counties = evaluation.county_pieces;
  if (!counties) return undefined;
  return Object.values(counties).filter(county => county.pieces >= 2).length;
};

/** Mirrors `RegionPieces`: occupied (county, district) pairs, so a county lying
 * entirely inside one district contributes 1. */
const planCountyPieces = (evaluation: DocumentEvaluation) => {
  const counties = evaluation.county_pieces;
  if (!counties) return undefined;
  return Object.values(counties).reduce((total, county) => total + county.pieces, 0);
};

const reduceDistricts = (
  scores: Record<string, number> | undefined,
  reducer: 'mean' | 'min' | 'max'
) => {
  const values = Object.values(scores ?? {}).filter(value => Number.isFinite(value));
  if (!values.length) return undefined;
  if (reducer === 'min') return Math.min(...values);
  if (reducer === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

type ElectionSeries =
  | 'efficiency_gap'
  | 'mean_median'
  | 'partisan_bias'
  | 'disproportionality'
  | 'eguia';

const electionMetric = (id: ElectionSeries, label: string): EnsembleMetricDef => ({
  id,
  label,
  category: 'partisan',
  perElection: true,
  format: 'signed_pct',
  distribution: (summary, election) => (election ? summary[id]?.[election] : undefined),
  planValue: (evaluation, election) => (election ? evaluation[id]?.[election] : undefined),
  stepValue: (step, election) => (election ? step[id]?.[election] : undefined),
});

type CompactnessScore = 'polsby_popper' | 'reock';
type CompactnessReducer = 'mean' | 'min' | 'max';

const compactnessMetric = (
  score: CompactnessScore,
  reducer: CompactnessReducer,
  label: string
): EnsembleMetricDef => ({
  id: `${score}_${reducer}`,
  label,
  category: 'compactness',
  perElection: false,
  format: 'decimal3',
  distribution: summary => summary[score]?.[reducer],
  planValue: evaluation => reduceDistricts(evaluation[score], reducer),
  stepValue: step => reduceDistricts(step[score], reducer),
});

const districtCountMetric = (
  id: 'n_dem_districts' | 'n_rep_districts' | 'n_swing_districts',
  label: string,
  pick: (step: EnsembleSegmentStep['competitiveness']) => number[]
): EnsembleMetricDef => ({
  id,
  label,
  category: 'competitiveness',
  perElection: false,
  format: 'count',
  distribution: summary => summary[id],
  planValue: evaluation =>
    evaluation.competitiveness ? pick(evaluation.competitiveness).length : undefined,
  stepValue: step => pick(step.competitiveness).length,
});

/** Every series the modal can chart, in menu order. */
export const ENSEMBLE_METRICS: EnsembleMetricDef[] = [
  {
    id: 'seats',
    label: 'Democratic seats',
    category: 'partisan',
    perElection: true,
    format: 'count',
    distribution: (summary, election) => (election ? summary.seats?.[election] : undefined),
    planValue: (evaluation, election) => (election ? evaluation.seats?.[election]?.dem : undefined),
    stepValue: (step, election) => (election ? step.seats?.[election]?.dem : undefined),
  },
  electionMetric('disproportionality', 'Disproportionality'),
  electionMetric('efficiency_gap', 'Efficiency gap'),
  electionMetric('mean_median', 'Mean-median'),
  electionMetric('partisan_bias', 'Partisan bias'),
  electionMetric('eguia', "Eguia's metric"),
  districtCountMetric('n_dem_districts', 'Dem sweep districts', c => c.dem_sweep_districts),
  districtCountMetric('n_rep_districts', 'Repub sweep districts', c => c.rep_sweep_districts),
  districtCountMetric('n_swing_districts', 'Swing districts', c => c.swing_districts),
  {
    id: 'n_competitive_contests',
    label: 'Competitive contests',
    category: 'competitiveness',
    perElection: false,
    format: 'count',
    distribution: summary => summary.n_competitive_contests,
    planValue: evaluation =>
      evaluation.competitiveness
        ? countCompetitiveContests(evaluation.competitiveness.contest_dem_vote_shares)
        : undefined,
    stepValue: step => countCompetitiveContests(step.competitiveness.contest_dem_vote_shares),
  },
  {
    id: 'county_splits',
    label: 'Counties split',
    category: 'splits',
    perElection: false,
    format: 'count',
    distribution: summary => summary.county_splits,
    planValue: planCountySplits,
    stepValue: step => step.county_splits?.splits,
  },
  {
    id: 'county_pieces',
    label: 'County pieces',
    category: 'splits',
    perElection: false,
    format: 'count',
    distribution: summary => summary.county_pieces,
    planValue: planCountyPieces,
    stepValue: step => step.county_splits?.pieces,
  },
  {
    id: 'cut_edges',
    label: 'Cut edges',
    category: 'compactness',
    perElection: false,
    format: 'count',
    distribution: summary => summary.cut_edges,
    planValue: evaluation => evaluation.cut_edges?.cut_count,
    stepValue: step => step.cut_edges?.cut_count,
  },
  compactnessMetric('polsby_popper', 'mean', 'Polsby-Popper, mean'),
  compactnessMetric('polsby_popper', 'min', 'Polsby-Popper, lowest'),
  compactnessMetric('polsby_popper', 'max', 'Polsby-Popper, highest'),
  compactnessMetric('reock', 'mean', 'Reock, mean'),
  compactnessMetric('reock', 'min', 'Reock, lowest'),
  compactnessMetric('reock', 'max', 'Reock, highest'),
];

export const findEnsembleMetric = (id: string) => ENSEMBLE_METRICS.find(metric => metric.id === id);

export const metricsInCategory = (category: EnsembleCategory) =>
  ENSEMBLE_METRICS.filter(metric => metric.category === category);

/** Where the histogram starts when the modal is opened without a cell to focus. */
export const DEFAULT_ENSEMBLE_FOCUS: EnsembleMetricFocus = {
  category: 'partisan',
  metric: 'disproportionality',
  election: 'pres_24',
};

/** Keeps a focus answerable against a given package: an unknown metric falls back
 * to the default, and a per-election metric to an election the ensemble holds. */
export const resolveFocus = (
  focus: EnsembleMetricFocus | null | undefined,
  summary: EnsembleSummary | undefined
): EnsembleMetricFocus => {
  const requested = focus ?? DEFAULT_ENSEMBLE_FOCUS;
  const metric = findEnsembleMetric(requested.metric)
    ? requested
    : {...DEFAULT_ENSEMBLE_FOCUS, election: requested.election};
  const def = findEnsembleMetric(metric.metric)!;
  if (!def.perElection) return {category: def.category, metric: def.id};
  const elections = summary?.elections ?? [];
  const election =
    metric.election && elections.includes(metric.election)
      ? metric.election
      : elections.includes(DEFAULT_ENSEMBLE_FOCUS.election!)
        ? DEFAULT_ENSEMBLE_FOCUS.election
        : elections[0];
  return {category: def.category, metric: def.id, election};
};

export const formatEnsembleValue = (
  value: number | undefined,
  format: EnsembleValueFormat
): string => {
  if (value === undefined || !Number.isFinite(value)) return '—';
  if (format === 'signed_pct') return formatNumber(value, NUMBER_FORMATS.SIGNED_PCT) ?? '—';
  if (format === 'decimal3') return value.toFixed(3);
  return Math.round(value).toLocaleString();
};

const totalCount = (dist: EnsembleDistribution) =>
  dist.counts.reduce((sum, count) => sum + count, 0);

/**
 * Share of ensemble plans below `value`, as a fraction.
 *
 * An integer series is read off its bucket counts exactly. A continuous one is
 * read off the 201-point quantile table, interpolating within the bracketing
 * pair; on a plateau (repeated quantile values, i.e. many plans sharing a
 * value) this returns the top of the plateau, so a value sitting exactly on one
 * reads as above the whole tie rather than below it.
 */
export const shareBelow = (
  dist: EnsembleDistribution,
  value: number | undefined
): number | null => {
  if (value === undefined || !Number.isFinite(value)) return null;
  const total = totalCount(dist);
  if (!total) return null;

  if (dist.kind === 'integer') {
    let below = 0;
    dist.edges.forEach((edge, index) => {
      if (edge < value) below += dist.counts[index] ?? 0;
    });
    return below / total;
  }

  const quantiles = dist.quantiles;
  if (quantiles && quantiles.length > 1) {
    if (value <= quantiles[0]) return 0;
    if (value >= quantiles[quantiles.length - 1]) return 1;
    let low = 0;
    let high = quantiles.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (quantiles[mid] <= value) low = mid;
      else high = mid - 1;
    }
    const step = 1 / (quantiles.length - 1);
    const span = quantiles[low + 1] - quantiles[low];
    const fraction = span > 0 ? (value - quantiles[low]) / span : 0;
    return Math.min(1, (low + fraction) * step);
  }

  // No quantile table: spread each bucket's count evenly across its width.
  let below = 0;
  for (let index = 0; index < dist.counts.length; index++) {
    const left = dist.edges[index];
    const right = dist.edges[index + 1];
    if (value >= right) below += dist.counts[index];
    else if (value > left) below += (dist.counts[index] * (value - left)) / (right - left);
  }
  return below / total;
};

/** The sentence the hover popups use, repeated under the chart. */
export const ensembleComparisonSentence = (args: {
  dist: EnsembleDistribution;
  value: number | undefined;
  format: EnsembleValueFormat;
}): string => {
  const {dist, value, format} = args;
  const median = `The median of the ensemble of randomly generated plans is ${formatEnsembleValue(
    dist.median,
    format
  )}.`;
  const share = shareBelow(dist, value);
  if (share === null) return median;
  const direction = share >= 0.5 ? 'greater' : 'less';
  const percent = (share >= 0.5 ? share : 1 - share) * 100;
  return `${median} This plan's value is ${direction} than ${percent.toFixed(
    0
  )}% of the ensemble plans.`;
};
