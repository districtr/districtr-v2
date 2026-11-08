import type {DiagPresetIndex, DiagRange} from '../diagTypes';

/** Four units, two districts with 0-based labels, range size 2 (so two range files). */
export const fixtureNodes = ['vtd:1', 'vtd:2', 'vtd:3', 'vtd:4'];

export const fixturePreset: DiagPresetIndex = {
  module: 'test',
  preset: 'p',
  weights: {county_splits: 1},
  n_plans: 4,
  n_districts: 2,
  n_nodes: 4,
  range_size: 2,
  metrics: [
    {key: 'county_splits', label: 'County splits', election: null},
    {key: 'county_pieces', label: 'County pieces', election: null},
    {key: 'polsby_popper_mean', label: 'Polsby-Popper mean', election: null},
    {key: 'seats__pres_16', label: 'Dem seats PRES16', election: 'pres_16'},
    {key: 'seats__pres_20', label: 'Dem seats PRES20', election: 'pres_20'},
    {key: 'cut_edges', label: 'Cut edges', election: null},
  ],
  buckets: {
    county_splits: [{label: 'bottom 1%', range: [1, 2], steps: [0, 3]}],
  },
  min_step: {county_splits: 0},
  max_step: {county_splits: 3},
};

/** Steps 0 and 1: rows [0,0,1,1] and [0,1,1,1]. */
export const fixtureRange0: DiagRange = {
  start: 0,
  assignments: 'AAABAQABAQE=',
  metrics: {county_splits: [1, 2], cut_edges: [10, 11]},
};

/** Steps 2 and 3: rows [1,0,0,1] and [1,1,0,0]. */
export const fixtureRange1: DiagRange = {
  start: 2,
  assignments: 'AQAAAQEBAAA=',
  metrics: {county_splits: [3, 4], cut_edges: [12, 13]},
};
