/**
 * Shapes of the static ensemble package the frontend reads straight from the CDN
 * (`ensembles/<module_slug>/…`, written by `pipelines/ensembles`; the contract is
 * `pipelines/README.md` § Ensembles).
 *
 * Every number in the package is precomputed. Nothing here is derived from map
 * geometry or adjacency in the browser.
 */

/** One chain configuration an ensemble was generated with. */
export interface EnsemblePreset {
  key: string;
  label: string;
  default: boolean;
  n_plans: number;
  generated_at: string;
  /** Module slug whose package folder holds this preset's files, when the
   * index is an alias for another module's package (a custom-districts module
   * reading its base module's ensemble). Absent means the index's own module. */
  package?: string;
}

export interface EnsembleIndex {
  module_slug: string;
  presets: EnsemblePreset[];
}

/**
 * One series over the whole ensemble.
 *
 * `edges` is one entry per integer value from `min` to `max` for an integer
 * series (so `counts` and `edges` have the same length), and 101 bucket
 * boundaries over `min`..`max` for a continuous one (`counts` has 100 entries).
 * `quantiles` is 201 points at q = 0, 0.005, …, 1, continuous series only.
 */
export interface EnsembleDistribution {
  /** `integer` and `discrete` list exact values in `edges`; `continuous` lists bucket edges. */
  kind: 'integer' | 'discrete' | 'continuous';
  edges: number[];
  counts: number[];
  median: number;
  min: number;
  max: number;
  quantiles?: number[];
}

export type EnsembleDistributionByElection = Record<string, EnsembleDistribution>;

/** A per-district compactness score, summarized four ways across the ensemble. */
export interface EnsembleCompactnessSummary {
  mean: EnsembleDistribution;
  min: EnsembleDistribution;
  max: EnsembleDistribution;
  /** Every district of every plan, pooled. */
  districts: EnsembleDistribution;
}

/** The Freedom to Vote Act test as the evaluation panel applies it. */
export interface EnsembleFtvSummary {
  elections: string[];
  threshold: number;
  share_passing: number;
}

export interface EnsembleSummary {
  n_plans: number;
  num_dists: number;
  elections: string[];
  seats: EnsembleDistributionByElection;
  efficiency_gap: EnsembleDistributionByElection;
  mean_median: EnsembleDistributionByElection;
  partisan_bias: EnsembleDistributionByElection;
  disproportionality: EnsembleDistributionByElection;
  eguia: EnsembleDistributionByElection;
  n_dem_districts: EnsembleDistribution;
  n_rep_districts: EnsembleDistribution;
  n_swing_districts: EnsembleDistribution;
  n_competitive_contests: EnsembleDistribution;
  county_splits: EnsembleDistribution;
  county_pieces: EnsembleDistribution;
  /** Cut edges carry the unit they were counted between (`block` for a
   * shatterable module's package, else the module's own unit). */
  cut_edges: EnsembleDistribution & {unit_type?: string};
  polsby_popper: EnsembleCompactnessSummary;
  reock: EnsembleCompactnessSummary;
  ftv: EnsembleFtvSummary;
}

export interface EnsembleStepCompetitiveness {
  dem_sweep_districts: number[];
  rep_sweep_districts: number[];
  swing_districts: number[];
  /** Sorted ascending, one entry per (district, election) pair. */
  contest_dem_vote_shares: number[];
  n_districts: number;
  n_elections: number;
}

/**
 * One plan of the demonstration segment. Keyed and shaped like the app's own
 * evaluation payload, except that county splits arrive already reduced to two
 * counts rather than a per-county table. District keys are the app's 1-based
 * zone numbers.
 */
export interface EnsembleSegmentStep {
  plan: number;
  seats: Record<string, {dem: number; rep: number; total: number}>;
  efficiency_gap: Record<string, number>;
  mean_median: Record<string, number>;
  partisan_bias: Record<string, number>;
  disproportionality: Record<string, number>;
  eguia: Record<string, number>;
  competitiveness: EnsembleStepCompetitiveness;
  polsby_popper: Record<string, number>;
  reock: Record<string, number>;
  cut_edges: {cut_count: number; unit_type: string};
  county_splits: {splits: number; pieces: number};
}

export interface EnsembleSegment {
  /** Index of the first step within the chain. */
  start: number;
  steps: EnsembleSegmentStep[];
}
