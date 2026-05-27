import {Heading, Table, Text} from '@radix-ui/themes';

export function SubsectionHeading({children}: {children: React.ReactNode}) {
  return (
    <Heading size="2" align="center" mb="2" mt="4">
      {children}
    </Heading>
  );
}

export function MetricRow({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <Table.Row>
      <Table.Cell>
        <Text size="2">
          {label}
        </Text>
      </Table.Cell>
      <Table.Cell justify="end">
        <Text size="2" weight="bold">
          {value}
        </Text>
      </Table.Cell>
    </Table.Row>
  );
}

const TYPE_LABELS: Record<string, string> = {
  pres: 'Pres',
  gov: 'Gov',
  sen: 'Sen',
  ag: 'AG',
};

export function formatElectionKey(key: string): string {
  const parts = key.split('_');
  const year = `20${parts[parts.length - 1]}`;
  const type = TYPE_LABELS[parts[0]] ?? parts[0].toUpperCase();
  return `${year} ${type}`;
}

export function formatPct(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

export function formatDecimal(value: number | undefined, digits = 3, signed = false): string {
  if (value === undefined || value === null || isNaN(value)) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}`;
}
