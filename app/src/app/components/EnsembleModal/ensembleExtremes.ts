import type {EnsembleObjectiveKey} from './ensembleTypes';

/**
 * Which extreme plans the histogram marks, and where their markers go.
 *
 * Pure functions only: the histogram and its tests share them.
 */

/** Every objective a search runs, in legend order. */
export const OBJECTIVE_ORDER: EnsembleObjectiveKey[] = [
  'dem_seats',
  'rep_seats',
  'competitive',
  'county_splits',
  'cut_edges',
  'polsby_popper',
];

/**
 * Marker colours, apart from the evaluated plan (accent) and the selected step
 * (amber). The two partisan objectives take the parties' conventional hues.
 */
export const OBJECTIVE_COLORS: Record<EnsembleObjectiveKey, string> = {
  dem_seats: 'var(--blue-10)',
  rep_seats: 'var(--red-10)',
  competitive: 'var(--grass-10)',
  county_splits: 'var(--brown-10)',
  cut_edges: 'var(--cyan-10)',
  polsby_popper: 'var(--pink-10)',
};

export const objectiveColor = (key: string): string =>
  OBJECTIVE_COLORS[key as EnsembleObjectiveKey] ?? 'var(--gray-10)';

/**
 * The objectives whose extreme plans bear on a charted series: the partisan
 * pair for every partisan series, the competitiveness search for the
 * competitiveness counts, and the matching single search for splits and
 * compactness. Reock has no search of its own and borrows Polsby-Popper's,
 * the other per-district shape score.
 */
export const relevantObjectives = (metricId: string): EnsembleObjectiveKey[] => {
  switch (metricId) {
    case 'seats':
    case 'disproportionality':
    case 'efficiency_gap':
    case 'mean_median':
    case 'partisan_bias':
    case 'eguia':
      return ['dem_seats', 'rep_seats'];
    case 'n_dem_districts':
    case 'n_rep_districts':
    case 'n_swing_districts':
    case 'n_competitive_contests':
      return ['competitive'];
    case 'county_splits':
    case 'county_pieces':
      return ['county_splits'];
    case 'cut_edges':
      return ['cut_edges'];
  }
  if (metricId.startsWith('polsby_popper_') || metricId.startsWith('reock_')) {
    return ['polsby_popper'];
  }
  return [];
};

export const isRelevantObjective = (metricId: string, key: string): boolean =>
  (relevantObjectives(metricId) as string[]).includes(key);

/** Legend position of an objective; keys outside the known six go last. */
export const objectiveRank = (key: string): number => {
  const index = (OBJECTIVE_ORDER as string[]).indexOf(key);
  return index < 0 ? OBJECTIVE_ORDER.length : index;
};

/**
 * Marker positions moved apart so that no two sit closer than `gap` pixels.
 *
 * Markers within `gap` of their neighbour form a cluster, spread evenly at
 * `gap` spacing around the cluster's mean; spreading can bring a cluster
 * within reach of the next, so clustering repeats until none touch. Output
 * order matches input order.
 */
export const spreadMarkers = (positions: number[], gap: number): number[] => {
  const order = positions.map((x, index) => ({x, index})).sort((a, b) => a.x - b.x);
  let clusters = order.map(item => ({members: [item.index], centre: item.x}));
  const span = (cluster: {members: number[]}) => (cluster.members.length - 1) * gap;
  let merged = true;
  while (merged) {
    merged = false;
    const next: typeof clusters = [];
    for (const cluster of clusters) {
      const last = next[next.length - 1];
      if (last && cluster.centre - span(cluster) / 2 - (last.centre + span(last) / 2) < gap) {
        const members = [...last.members, ...cluster.members];
        const centre =
          (last.centre * last.members.length + cluster.centre * cluster.members.length) /
          members.length;
        next[next.length - 1] = {members, centre};
        merged = true;
      } else {
        next.push(cluster);
      }
    }
    clusters = next;
  }
  const result = new Array<number>(positions.length);
  for (const cluster of clusters) {
    const start = cluster.centre - span(cluster) / 2;
    cluster.members.forEach((member, rank) => {
      result[member] = start + rank * gap;
    });
  }
  return result;
};
