/**
 * County FIPS (STATEFP+COUNTYFP) of a unit path: the first 5 chars of the
 * bare geoid, after any `<type>:` prefix. Handles both `vtd:48001000001`
 * and plain `480010000011000` forms. Same rule as the backend county
 * filter SQL and the maplibre expression in useCountyFilter.
 */
export const countyFipsOfPath = (path: string): string => {
  const sep = path.indexOf(':');
  return sep === -1 ? path.slice(0, 5) : path.slice(sep + 1, sep + 6);
};
