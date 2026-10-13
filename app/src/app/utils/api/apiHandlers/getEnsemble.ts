import {CDN_URL} from '../constants';

/**
 * Client for the static ensemble packages on the public CDN, under
 * `ensembles/<module slug>/`. A package holds the metric distributions of an
 * ensemble of computer-drawn plans for one map module; the evaluation panel
 * reads it directly, with no backend involved. `pipelines/README.md`
 * ("Ensembles") is the contract these types mirror.
 *
 * A module without a package answers 404 on `index.json`, which is a normal
 * state rather than an error: most modules have no ensemble.
 */

/** One chain configuration, as `index.json` lists it. */
export interface EnsemblePreset {
  key: string;
  label: string;
  /** The preset offered before the reader chooses one. */
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
 * The distribution of one metric over every plan in the ensemble.
 *
 * `counts[i]` is the number of plans in bucket `i`. An `integer` series has one
 * bucket per integer value, so bucket `i` holds exactly the plans whose value is
 * `edges[i]`. A `continuous` series has 100 equal-width buckets, half-open except
 * the last, and carries `quantiles`: 201 values at q = 0, 0.005, …, 1.
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
  /** Plans whose value was undefined, excluded from the buckets. */
  n_missing?: number;
}

/** Freedom to Vote Act test over the ensemble. */
export interface EnsembleFtv {
  elections: string[];
  threshold: number;
  share_passing: number;
}

type ByElection = Record<string, EnsembleDistribution>;

/** Mean, min and max across a plan's districts, plus every district of every plan. */
interface CompactnessDistributions {
  mean: EnsembleDistribution;
  min: EnsembleDistribution;
  max: EnsembleDistribution;
  districts: EnsembleDistribution;
}

export interface EnsembleSummary {
  n_plans: number;
  num_dists: number;
  elections: string[];
  seats: ByElection;
  efficiency_gap: ByElection;
  mean_median: ByElection;
  partisan_bias: ByElection;
  disproportionality: ByElection;
  eguia: ByElection;
  n_dem_districts: EnsembleDistribution;
  n_rep_districts: EnsembleDistribution;
  n_swing_districts: EnsembleDistribution;
  n_competitive_contests: EnsembleDistribution;
  county_splits: EnsembleDistribution;
  county_pieces: EnsembleDistribution;
  // Counted between blocks for a shatterable module's package, else the module's own unit.
  cut_edges: EnsembleDistribution & {unit_type?: string};
  polsby_popper: CompactnessDistributions;
  reock: CompactnessDistributions;
  /** Absent when the module lacks two presidential and two senate elections. */
  ftv?: EnsembleFtv;
}

export const ensembleUrl = (moduleSlug: string, path: string) =>
  `${CDN_URL}/ensembles/${moduleSlug}/${path}`;

/** `index.json` for a module, or null when the module has no ensemble package. */
export const getEnsembleIndex = async (moduleSlug: string): Promise<EnsembleIndex | null> => {
  const response = await fetch(ensembleUrl(moduleSlug, 'index.json'));
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Ensemble index for ${moduleSlug}: ${response.status}`);
  return (await response.json()) as EnsembleIndex;
};

export const getEnsembleSummary = async (
  moduleSlug: string,
  preset: string
): Promise<EnsembleSummary> => {
  const response = await fetch(ensembleUrl(moduleSlug, `${preset}/summary.json`));
  if (!response.ok) {
    throw new Error(`Ensemble summary for ${moduleSlug}/${preset}: ${response.status}`);
  }
  return (await response.json()) as EnsembleSummary;
};
