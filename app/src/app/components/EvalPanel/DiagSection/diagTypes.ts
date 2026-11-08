/**
 * Types of the diagnosis package on the CDN, under `ensembles-diag/<module>/`.
 * A module folder holds `index.json` (its presets) and one folder per preset
 * with `index.json`, `nodes.json`, `steps/<k>.json` and `registry.json`.
 */

/** One entry of a module's `index.json`. */
export interface DiagModulePreset {
  key: string;
  label: string;
  default: boolean;
  n_plans: number;
  generated_at: string;
  /** Module whose folder holds this preset's files, on alias modules. */
  package?: string;
}

export interface DiagModuleIndex {
  module_slug: string;
  presets: DiagModulePreset[];
}

export interface DiagMetricInfo {
  key: string;
  label: string;
  election?: string | null;
}

export interface DiagBucket {
  label: string;
  /** Null for an empty bucket. */
  range: [number, number] | null;
  quantiles?: unknown;
  /** Sample step ids drawn from this quantile bucket. */
  steps: number[];
}

export interface DiagPresetIndex {
  module: string;
  preset: string;
  weights: Record<string, number> | unknown;
  n_plans: number;
  n_districts: number;
  n_nodes: number;
  range_size: number;
  metrics: DiagMetricInfo[];
  buckets: Record<string, DiagBucket[]>;
  min_step: Record<string, number>;
  max_step: Record<string, number>;
  cut_edges_unit_type?: string;
  generated_at?: string;
}

/** `steps/<k>.json`: `range_size` consecutive steps starting at `start`. */
export interface DiagRange {
  start: number;
  /** Base64 of rows × n_nodes uint8 values, row-major, one row per step. */
  assignments: string;
  metrics: Record<string, (number | null)[]>;
}

/** One opened plan. Holds the public id only: the document UUID is the edit capability. */
export interface DiagRegistryEntry {
  preset: string;
  step: number;
  public_id: number;
  note: string;
  when: string;
}
