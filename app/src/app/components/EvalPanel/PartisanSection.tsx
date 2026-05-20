'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey, formatPct, SubsectionHeading} from './shared';

interface Props {
  evaluation: DocumentEvaluation;
}

export function PartisanSection({evaluation}: Props) {
  const elections = Object.keys(evaluation.seats ?? {});
  const n = elections.length;
  const competitiveness = evaluation.competitiveness;

  if (!n && !competitiveness) return null;

  return (
    <Accordion.Root type="single" collapsible defaultValue="partisan">
      <Accordion.Item value="partisan">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon />
            <Heading size="4">Election Results and Partisanship</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>
          {n > 0 && (
            <Text size="2" color="gray" mb="3" as="p">
              Our current dataset contains <strong>{n} recent statewide election{n !== 1 ? 's' : ''}</strong>.{' '}
              <strong>These metrics are descriptive, not prescriptive</strong> — there is no single
              score that makes a plan fair, and a plan can score well on one measure while scoring
              poorly on another.
            </Text>
          )}

          {/* Proportionality */}
          {n > 0 && (
            <>
              <SubsectionHeading>Proportionality</SubsectionHeading>
              <Table.Root size="1" mb="3">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Election</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Dem seats</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Rep seats</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Disproportionality</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {elections.map(key => {
                    const seats = evaluation.seats?.[key];
                    const total = seats ? seats.dem + seats.rep : null;
                    const demPct = total ? seats!.dem / total : null;
                    const repPct = total ? seats!.rep / total : null;
                    return (
                      <Table.Row key={key}>
                        <Table.Cell>
                          <Text size="2">{formatElectionKey(key)}</Text>
                        </Table.Cell>
                        <Table.Cell justify="end">
                          <Text size="2">
                            {seats && demPct !== null
                              ? `${seats.dem} (${(demPct * 100).toFixed(1)}%)`
                              : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell justify="end">
                          <Text size="2">
                            {seats && repPct !== null
                              ? `${seats.rep} (${(repPct * 100).toFixed(1)}%)`
                              : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell justify="end">
                          <Text size="2">{formatPct(evaluation.disproportionality?.[key])}</Text>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>
            </>
          )}

          {/* Other Partisanship Metrics */}
          {n > 0 && (
            <>
              <SubsectionHeading>Other Partisanship Metrics</SubsectionHeading>
              <Text size="2" color="gray" mb="3" as="p">
                The following scores can all be found in the political science literature, but are
                not necessarily endorsed by leading scholars at this time.
              </Text>
              <Table.Root size="1" mb="3">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Election</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Efficiency gap</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Mean-median</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Partisan bias</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Eguia</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {elections.map(key => (
                    <Table.Row key={key}>
                      <Table.Cell>
                        <Text size="2">{formatElectionKey(key)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{formatPct(evaluation.efficiency_gap?.[key])}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{formatPct(evaluation.mean_median?.[key])}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{formatPct(evaluation.partisan_bias?.[key])}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{formatPct(evaluation.eguia?.[key])}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </>
          )}

          {/* Competitiveness Metrics */}
          {competitiveness && (
            <>
              <SubsectionHeading>Competitiveness</SubsectionHeading>
              <Text size="2" color="gray" mb="3" as="p">
                Competitiveness measures how many districts are closely contested. A swing district
                is one where the result could plausibly change with a small shift in the statewide
                vote.
              </Text>
              <Table.Root size="1">
                <Table.Body>
                  <Table.Row>
                    <Table.Cell><Text size="2" color="gray">Competitive districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">
                        {competitiveness.n_competitive_districts} / {competitiveness.n_districts}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2" color="gray">Swing districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_swing_districts}</Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2" color="gray">Safe Dem districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_dem_districts}</Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2" color="gray">Safe Rep districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_rep_districts}</Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2" color="gray">Elections analyzed</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_elections}</Text>
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              </Table.Root>
            </>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
