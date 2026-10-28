/** Renumber mapping that moves district `from` to number `to`, shifting the districts
 * in between by one toward `from`'s old number (a list reorder, not a swap). */
export const moveZoneMapping = (from: number, to: number) => {
  const mapping = new Map<number, number>();
  if (from === to) return mapping;
  const step = from < to ? -1 : 1;
  mapping.set(from, to);
  for (let zone = to; zone !== from; zone += step) mapping.set(zone, zone + step);
  return mapping;
};
