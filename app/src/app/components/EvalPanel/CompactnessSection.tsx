'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {SubsectionHeading, formatDecimal} from './shared';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

// Anchor reference districts drawn from Moon Duchin's work.
// TODO: Replace placeholder scores with values from
// Duchin (2022) "Outlier Analysis for Pennsylvania" or equivalent source.
// TODO: Add district shape images sourced from the same publication.
const ANCHOR_DISTRICTS = [
  {
    label: 'Alabama 1st (2012)',
    description: 'Non-compact — elongated coastal district',
    polsby_popper: 0.153,
    reock: 0.303,
    // TODO: import actual image asset
    image: null,
  },
  {
    label: 'Oklahoma 5th (2023)',
    description: 'Medium — irregular urban district',
    polsby_popper: 0.255,
    reock: 0.396,
    // TODO: import actual image asset
    image: null,
  },
  {
    label: 'TODO: compact reference district',
    description: 'Compact — consult Duchin (2022) for canonical example',
    polsby_popper: null,
    reock: null,
    image: null,
  },
];

interface Props {
  evaluation: DocumentEvaluation;
}

function ScoreSummary({scores}: {scores: Record<string, number>}) {
  const values = Object.values(scores).filter(v => !isNaN(v));
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <Table.Root size="1" mb="2">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell />
          <Table.ColumnHeaderCell justify="end">Your Plan</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        <Table.Row>
          <Table.Cell><Text size="2">Max</Text></Table.Cell>
          <Table.Cell justify="end"><Text size="2">{max.toFixed(3)}</Text></Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell><Text size="2">Min</Text></Table.Cell>
          <Table.Cell justify="end"><Text size="2">{min.toFixed(3)}</Text></Table.Cell>
        </Table.Row>
        <Table.Row>
          <Table.Cell><Text size="2">Mean</Text></Table.Cell>
          <Table.Cell justify="end"><Text size="2">{mean.toFixed(3)}</Text></Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
}

function PerDistrictTable({
  polsby_popper,
  reock,
}: {
  polsby_popper: Record<string, number>;
  reock: Record<string, number>;
}) {
  const getZoneColor = useZoneColorGetter();
  const zones = Object.keys(polsby_popper).sort((a, b) => Number(a) - Number(b));

  return (
    <Table.Root size="1">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>District</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell justify="end">Polsby-Popper</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell justify="end">Reock</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {zones.map(zone => (
          <Table.Row key={zone}>
            <Table.Cell>
              <Flex align="center" gap="2">
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: getZoneColor(Number(zone)),
                    flexShrink: 0,
                  }}
                />
                <Text size="2">{zone}</Text>
              </Flex>
            </Table.Cell>
            <Table.Cell justify="end">
              <Text size="2">{formatDecimal(polsby_popper[zone], 3)}</Text>
            </Table.Cell>
            <Table.Cell justify="end">
              <Text size="2">{formatDecimal(reock[zone], 3)}</Text>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function AnchorExamples() {
  return (
    <Flex direction="column" gap="2" mt="3">
      <Text size="1" color="gray" className="uppercase tracking-widest">
        Reference Districts
      </Text>
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>District</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">Polsby-Popper</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">Reock</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {ANCHOR_DISTRICTS.map(d => (
            <Table.Row key={d.label}>
              <Table.Cell>
                <Flex direction="column">
                  {/* TODO: render d.image when assets are available */}
                  <Text size="2">{d.label}</Text>
                  <Text size="1" color="gray">{d.description}</Text>
                </Flex>
              </Table.Cell>
              <Table.Cell justify="end">
                <Text size="2">{d.polsby_popper !== null ? d.polsby_popper.toFixed(3) : '—'}</Text>
              </Table.Cell>
              <Table.Cell justify="end">
                <Text size="2">{d.reock !== null ? d.reock.toFixed(3) : '—'}</Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}

export function CompactnessSection({evaluation}: Props) {
  const {cut_edges, polsby_popper, reock} = evaluation;

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

          {/* Polsby-Popper */}
          <SubsectionHeading>Polsby-Popper Scores</SubsectionHeading>
          <Text size="2" color="gray" as="p" mb="3">
            The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its
            perimeter. Scores range from 0 to 1; higher scores indicate more compact districts.
            Unlike cut edges, this measure depends on map projection and boundary resolution rather
            than the choice of geographic units.
          </Text>
          {polsby_popper ? (
            <>
              <ScoreSummary scores={polsby_popper} />
              <Text size="1" color="gray" className="uppercase tracking-widest" mb="1">
                Per-district scores
              </Text>
              <PerDistrictTable
                polsby_popper={polsby_popper}
                reock={reock ?? {}}
              />
              <AnchorExamples />
            </>
          ) : (
            <Text size="2" color="gray">Not available for this plan.</Text>
          )}

          {/* Reock */}
          <SubsectionHeading>Reock Scores</SubsectionHeading>
          <Text size="2" color="gray" as="p" mb="3">
            The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of
            the smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1;
            higher scores indicate more compact, circular districts. Reock is sensitive to map
            projection and is computed on-demand when the evaluation view is opened.
          </Text>
          {reock ? (
            <ScoreSummary scores={reock} />
          ) : (
            <Text size="2" color="gray">Not available for this plan.</Text>
          )}

        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
