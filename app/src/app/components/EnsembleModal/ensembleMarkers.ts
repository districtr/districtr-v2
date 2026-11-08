/**
 * Where the histogram's value markers go when their values coincide.
 *
 * Pure functions only: the histogram and its tests share them.
 */

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
