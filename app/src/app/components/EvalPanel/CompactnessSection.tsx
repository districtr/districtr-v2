'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {SubsectionHeading} from './shared';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

// Anchor reference districts drawn from Moon Duchin's work.
// TODO: Replace placeholder scores with values from
// Duchin (2022) "Outlier Analysis for Pennsylvania" or equivalent source.
// TODO: Add district shape images sourced from the same publication.
const LEVELS = [
  {
    label: 'Low',
    color: 'red' as const,
    anchor: {
      label: 'Alabama 1st (2012)',
      description: 'Non-compact — elongated coastal district',
      polsby_popper: 0.153,
      reock: 0.303,
    },
    pp:    {min: 0,    max: 0.20},
    reock: {min: 0,    max: 0.35},
  },
  {
    label: 'Medium',
    color: 'amber' as const,
    anchor: {
      label: 'Oklahoma 5th (2023)',
      description: 'Medium — irregular urban district',
      polsby_popper: 0.255,
      reock: 0.396,
    },
    pp:    {min: 0.20, max: 0.35},
    reock: {min: 0.35, max: 0.50},
  },
  {
    label: 'High',
    color: 'green' as const,
    anchor: {
      // TODO: Replace with canonical compact reference district from Moon Duchin
      label: null,
      description: null,
      polsby_popper: null,
      reock: null,
    },
    pp:    {min: 0.35, max: Infinity},
    reock: {min: 0.50, max: Infinity},
  },
];

interface Props {
  evaluation: DocumentEvaluation;
}

function rangeLabel({min, max}: {min: number; max: number}): string {
  return max === Infinity ? `≥ ${min.toFixed(2)}` : `${min.toFixed(2)}–${max.toFixed(2)}`;
}

function scoreStats(scores: Record<string, number>) {
  const values = Object.values(scores).filter(v => !isNaN(v));
  if (!values.length) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

function DistrictDots({
  scores,
  min,
  max,
  getZoneColor,
}: {
  scores: Record<string, number>;
  min: number;
  max: number;
  getZoneColor: (zone: number) => string;
}) {
  const zones = Object.keys(scores)
    .sort((a, b) => Number(a) - Number(b))
    .filter(z => scores[z] >= min && scores[z] < max);

  if (zones.length === 0) return <Text size="2" color="gray">—</Text>;
  return (
    <Flex wrap="wrap" gap="2" align="center">
      {zones.map(zone => (
        <Flex key={zone} align="center" gap="1">
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: getZoneColor(Number(zone)),
              flexShrink: 0,
            }}
          />
          <Text size="2">{zone}</Text>
        </Flex>
      ))}
    </Flex>
  );
}

function LevelGroup({
  level,
  polsby_popper,
  reock,
  getZoneColor,
}: {
  level: (typeof LEVELS)[0];
  polsby_popper: Record<string, number>;
  reock: Record<string, number>;
  getZoneColor: (zone: number) => string;
}) {
  const {label, color, anchor, pp, reock: reockRange} = level;

  return (
    <Flex direction="column" gap="2" mb="4">
      <Text size="3" weight="bold" color={color}>{label}</Text>

      {anchor.label ? (
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Reference district</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">PP</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Reock</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>
                <Flex direction="column">
                  <Text size="2">{anchor.label}</Text>
                  {anchor.description && (
                    <Text size="1" color="gray">{anchor.description}</Text>
                  )}
                </Flex>
              </Table.Cell>
              <Table.Cell justify="end">
                <Text size="2">{anchor.polsby_popper?.toFixed(3) ?? '—'}</Text>
              </Table.Cell>
              <Table.Cell justify="end">
                <Text size="2">{anchor.reock?.toFixed(3) ?? '—'}</Text>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      ) : null}

      <Flex align="start" gap="3">
        <Flex direction="column" style={{minWidth: '9rem', flexShrink: 0}}>
          <Text size="2" color="gray">Polsby-Popper</Text>
          <Text size="1" color="gray">{rangeLabel(pp)}</Text>
        </Flex>
        <DistrictDots scores={polsby_popper} min={pp.min} max={pp.max} getZoneColor={getZoneColor} />
      </Flex>

      <Flex align="start" gap="3">
        <Flex direction="column" style={{minWidth: '9rem', flexShrink: 0}}>
          <Text size="2" color="gray">Reock</Text>
          <Text size="1" color="gray">{rangeLabel(reockRange)}</Text>
        </Flex>
        <DistrictDots scores={reock} min={reockRange.min} max={reockRange.max} getZoneColor={getZoneColor} />
      </Flex>
    </Flex>
  );
}

export function CompactnessSection({evaluation}: Props) {
  const {cut_edges, polsby_popper, reock} = evaluation;
  const getZoneColor = useZoneColorGetter();

  const ppStats = polsby_popper ? scoreStats(polsby_popper) : null;
  const reockStats = reock ? scoreStats(reock) : null;

  return (
    <Accordion.Root type="single" collapsible defaultValue="compactness">
      <Accordion.Item value="compactness">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon />
            <Heading size="4">Compactness</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>

          {/* Cut Edges */}
          <SubsectionHeading>Cut Edges</SubsectionHeading>
          {cut_edges ? (
            <>
              <Text size="2" mb="2" as="p">
                Your plan has{' '}
                <strong>{cut_edges.cut_count.toLocaleString()}</strong> cut edges between{' '}
                {cut_edges.unit_type}s.
              </Text>
              <Text size="2" color="gray" as="p">
                One measurement of compactness is the number of <strong>cut edges</strong> in a
                districting plan. This counts the number of adjacent {cut_edges.unit_type}s that
                are separated into different districts. You should only compare cut edge counts
                between plans for the same state using the same units — a lower number means a more
                compact plan.
              </Text>
            </>
          ) : (
            <Text size="2" color="gray">Not available for this plan.</Text>
          )}

          {/* Shape-based scores */}
          {(polsby_popper || reock) && (
            <>
              <SubsectionHeading>Shape-based Scores</SubsectionHeading>

              <Text size="2" color="gray" as="p" mb="2">
                The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its
                perimeter — higher scores (closer to 1) mean more compact districts.
                {ppStats && (
                  <> In your plan, scores range from <strong>{ppStats.min.toFixed(3)}</strong> to{' '}
                  <strong>{ppStats.max.toFixed(3)}</strong> with a mean of{' '}
                  <strong>{ppStats.mean.toFixed(3)}</strong>.</>
                )}
              </Text>

              <Text size="2" color="gray" as="p" mb="3">
                The <strong>Reock score</strong> measures each district&apos;s area against the
                smallest enclosing circle — higher scores indicate more circular, compact districts.
                {reockStats && (
                  <> In your plan, scores range from <strong>{reockStats.min.toFixed(3)}</strong> to{' '}
                  <strong>{reockStats.max.toFixed(3)}</strong> with a mean of{' '}
                  <strong>{reockStats.mean.toFixed(3)}</strong>.</>
                )}
              </Text>

              {LEVELS.map(level => (
                <LevelGroup
                  key={level.label}
                  level={level}
                  polsby_popper={polsby_popper ?? {}}
                  reock={reock ?? {}}
                  getZoneColor={getZoneColor}
                />
              ))}
            </>
          )}

        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
