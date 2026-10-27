const TYPE_LABELS: Record<string, string> = {
  pres: 'PRES',
  gov: 'GOV',
  sen: 'SEN',
  ag: 'AG',
};

export interface ElectionKey {
  /** The raw key, kept so callers can index the evaluation maps with it. */
  key: string;
  /** Office prefix, e.g. "pres", "sen", "gov", "ag". */
  type: string;
  /** Full four-digit year. */
  year: number;
}

// Election keys look like "pres_24" or "sen_22": the office prefix, then a
// two-digit year as the last segment. Every place that needs either part
// goes through here so the format is encoded once.
export function parseElectionKey(key: string): ElectionKey {
  const parts = key.split('_');
  return {key, type: parts[0], year: 2000 + Number(parts[parts.length - 1])};
}

export function formatElectionKey(key: string): string {
  const {type, year} = parseElectionKey(key);
  return `${year} ${TYPE_LABELS[type] ?? type.toUpperCase()}`;
}

// The Freedom to Vote Act (S.2747) proportionality test evaluates the 2 most
// recent Presidential and 2 most recent Senate elections. Returns null when
// a state's dataset doesn't have both pairs available.
export function selectFtvElections(
  seatsKeys: string[]
): {pres: [string, string]; sen: [string, string]} | null {
  const parsed = seatsKeys.map(parseElectionKey);
  const topTwoByYear = (type: string) =>
    parsed
      .filter(e => e.type === type)
      .sort((a, b) => b.year - a.year)
      .slice(0, 2)
      .map(e => e.key);
  const pres = topTwoByYear('pres');
  const sen = topTwoByYear('sen');
  if (pres.length < 2 || sen.length < 2) return null;
  return {pres: [pres[0], pres[1]], sen: [sen[0], sen[1]]};
}
