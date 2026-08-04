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
