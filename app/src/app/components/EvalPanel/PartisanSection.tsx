'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey, formatPct, SubsectionHeading} from './shared';

interface Props {
  evaluation: DocumentEvaluation;
}

const DEM = '#2563eb';
const REP = '#dc2626';
const NEUTRAL = 'rgba(128, 128, 128, 0.08)';

const demBg = (alpha: number) =>
  `color-mix(in srgb, ${DEM} ${(alpha * 100).toFixed(0)}%, transparent)`;
const repBg = (alpha: number) =>
  `color-mix(in srgb, ${REP} ${(alpha * 100).toFixed(0)}%, transparent)`;

const metricBg = (value: number | undefined) => {
  if (value == null) return undefined;
  if (value > 0) return demBg(Math.min(value * 1.5, 0.6));
  if (value < 0) return repBg(Math.min(Math.abs(value) * 1.5, 0.6));
  return undefined;
};

function dispLabel(disp: number, numDistricts: number): string {
  const seatLean = disp * numDistricts;
  if (Math.abs(seatLean) < 0.05) return 'As proportional as possible';
  const abs = Math.abs(seatLean).toFixed(1);
  return seatLean > 0
    ? `Leans Democrat by ${abs} seats`
    : `Leans Republican by ${abs} seats`;
}

const LEVEL_ORDER: Record<string, number> = {pres: 0, sen: 1, gov: 2, ag: 3};

function sortElections(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aParts = a.split('_'), bParts = b.split('_');
    const aYear = Number(aParts[aParts.length - 1]);
    const bYear = Number(bParts[bParts.length - 1]);
    if (bYear !== aYear) return bYear - aYear; // descending year
    const aLevel = LEVEL_ORDER[aParts[0]] ?? 99;
    const bLevel = LEVEL_ORDER[bParts[0]] ?? 99;
    return aLevel - bLevel; // pres < sen < gov
  });
}

export function PartisanSection({evaluation}: Props) {
  const elections = sortElections(Object.keys(evaluation.seats ?? {}));
  const n = elections.length;
  const competitiveness = evaluation.competitiveness;
  if (!n && !competitiveness) return null;

  const avgSeatLean =
    n > 0 && evaluation.seats
      ? elections.reduce((sum, key) => {
          const s = evaluation.seats![key];
          return sum + (s ? s.dem - s.rep : 0);
        }, 0) / n
      : null;

  const firstSeats = n > 0 ? evaluation.seats?.[elections[0]] : null;
  const numDistricts = firstSeats ? firstSeats.dem + firstSeats.rep : null;

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
            <Text size="2" mb="3" as="p">
              Our current dataset contains <strong>{n} recent statewide election{n !== 1 ? 's' : ''}</strong>.{' '}
            </Text>
          )}

          {/* Proportionality */}
          {n > 0 && (
            <>
              <SubsectionHeading>Proportionality</SubsectionHeading>
              <Text size="2" mb="3" as="p">
                Relative to proportionality, your plan has an average lean of{' '}
                {avgSeatLean !== null ? (
                  <>
                    <strong>{Math.abs(avgSeatLean).toFixed(1)} seats</strong> towards{' '}
                    {avgSeatLean >= 0 ? 'Democrats' : 'Republicans'}
                  </>
                ) : (
                  '—'
                )}{' '}
                over these elections.
              </Text>
              <Text size="2" weight="bold" mb="2" as="p" style={{textAlign: 'center'}}>
                Votes vs. Seats by Election (among the two major parties)
              </Text>
              <Table.Root size="1" mb="3">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Election</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: DEM}}>
                      Dem<br />Votes
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: DEM}}>
                      Dem<br />Seats
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: REP}}>
                      Rep<br />Votes
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: REP}}>
                      Rep<br />Seats
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">
                      Disproportionality
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {elections.map(key => {
                    const seats = evaluation.seats?.[key];
                    const total = seats ? seats.dem + seats.rep : null;
                    const demPct = total ? seats!.dem / total : null;
                    const repPct = total ? seats!.rep / total : null;
                    const voteShares = evaluation.vote_shares?.[key];
                    const disp = evaluation.disproportionality?.[key] ?? null;
                    return (
                      <Table.Row key={key}>
                        <Table.Cell>
                          <Text size="2" weight="bold">{formatElectionKey(key)}</Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{backgroundColor: voteShares?.dem != null
                            ? voteShares.dem > 0.5 ? demBg((voteShares.dem - 0.5) * 1.5) : NEUTRAL
                            : undefined}}
                        >
                          <Text size="2">
                            {voteShares && voteShares.dem !== null
                              ? `${(voteShares.dem * 100).toFixed(1)}%`
                              : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={demPct !== null
                            ? {backgroundColor: demPct > 0.5 ? demBg((demPct - 0.5) * 1.5) : NEUTRAL}
                            : {}}
                        >
                          <Text size="2">
                            {demPct !== null ? `${(demPct * 100).toFixed(1)}%` : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{backgroundColor: voteShares?.rep != null
                            ? voteShares.rep > 0.5 ? repBg((voteShares.rep - 0.5) * 1.2) : NEUTRAL
                            : undefined}}
                        >
                          <Text size="2">
                            {voteShares && voteShares.rep !== null
                              ? `${(voteShares.rep * 100).toFixed(1)}%`
                              : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={repPct !== null
                            ? {backgroundColor: repPct > 0.5 ? repBg((repPct - 0.5) * 1.2) : NEUTRAL}
                            : {}}
                        >
                          <Text size="2">
                            {repPct !== null ? `${(repPct * 100).toFixed(1)}%` : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="end"
                          style={disp !== null
                            ? {
                                backgroundColor:
                                  disp > 0
                                    ? demBg(Math.min(Math.abs(disp) * 2.5, 0.35))
                                    : disp < 0
                                    ? repBg(Math.min(Math.abs(disp) * 2.5, 0.35))
                                    : 'transparent',
                              }
                            : {}}
                        >
                          <Text size="2">
                            {disp !== null && numDistricts !== null
                              ? dispLabel(disp, numDistricts)
                              : '—'}
                          </Text>
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
              <Text size="2" mb="3" as="p">
                The following scores can all be found in the political science literature, but are
                not necessarily endorsed by leading scholars at this time.
              </Text>
              <Table.Root size="1" mb="3">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Election</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Efficiency<br />Gap</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Mean<br />Median</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Partisan<br />Bias</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Eguia's<br />Metric</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {elections.map(key => (
                    <Table.Row key={key}>
                      <Table.Cell>
                        <Text size="2" weight="bold">{formatElectionKey(key)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: metricBg(evaluation.efficiency_gap?.[key])}}>
                        <Text size="2">{formatPct(evaluation.efficiency_gap?.[key])}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: metricBg(evaluation.mean_median?.[key])}}>
                        <Text size="2">{formatPct(evaluation.mean_median?.[key])}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: metricBg(evaluation.partisan_bias?.[key])}}>
                        <Text size="2">{formatPct(evaluation.partisan_bias?.[key])}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: metricBg(evaluation.eguia?.[key])}}>
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
              <Text size="2" mb="3" as="p">
                Competitiveness measures how many districts are closely contested. A swing district
                is one where the result could plausibly change with a small shift in the statewide
                vote.
              </Text>
              <Table.Root size="1">
                <Table.Body>
                  <Table.Row>
                    <Table.Cell><Text size="2">Competitive contests</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">
                        {competitiveness.n_competitive_districts} / {competitiveness.n_districts * competitiveness.n_elections}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2">Swing districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_swing_districts}</Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2">Safe Dem districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_dem_districts}</Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2">Safe Rep districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_rep_districts}</Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2">Elections analyzed</Text></Table.Cell>
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
