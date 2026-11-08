/**
 * Types of the diagnosis package on the CDN, under `ensembles-diag/<module>/`.
 * A module folder holds `index.json` (its presets) and one folder per preset
 * with `index.json`, `nodes.json`, `steps/<k>.json` and `registry.json`.
 */

/** One entry of a module's `index.json`; `path` is the preset folder relative to the module folder. */
export interface DiagModulePreset {
  key: string;
  path: string;
}

export interface DiagModuleIndex {
  module: string;
  presets: DiagModulePreset[];
}

export interface DiagMetricInfo {
  key: string;
  label: string;
  election?: string | null;
}

export interface DiagBucket {
  label: string;
  range: [number, number];
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
}

/** `steps/<k>.json`: `range_size` consecutive steps starting at `start`. */
export interface DiagRange {
  start: number;
  /** Base64 of rows × n_nodes uint8 values, row-major, one row per step. */
  assignments: string;
  metrics: Record<string, number[]>;
}

/** One opened plan. Holds the public id only: the document UUID is the edit capability. */
export interface DiagRegistryEntry {
  preset: string;
  step: number;
  public_id: number;
  note: string;
  when: string;
}
