const TYPE_LABELS: Record<string, string> = {
  pres: 'PRES',
  gov: 'GOV',
  sen: 'SEN',
  ag: 'AG',
};

export function formatElectionKey(key: string): string {
  const parts = key.split('_');
  const year = `20${parts[parts.length - 1]}`;
  const type = TYPE_LABELS[parts[0]] ?? parts[0].toUpperCase();
  return `${year} ${type}`;
}

// The Freedom to Vote Act (S.2747) proportionality test evaluates the 2 most
// recent Presidential and 2 most recent Senate elections. Returns null when
// a state's dataset doesn't have both pairs available.
export function selectFtvElections(
  seatsKeys: string[]
): {pres: [string, string]; sen: [string, string]} | null {
  const topTwoByYear = (prefix: string) =>
    seatsKeys
      .filter(k => k.startsWith(`${prefix}_`))
      .sort((a, b) => Number(b.split('_')[1]) - Number(a.split('_')[1]))
      .slice(0, 2);
  const pres = topTwoByYear('pres');
  const sen = topTwoByYear('sen');
  if (pres.length < 2 || sen.length < 2) return null;
  return {pres: [pres[0], pres[1]], sen: [sen[0], sen[1]]};
}
