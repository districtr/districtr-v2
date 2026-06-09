'use client';
import {useState} from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading, SegmentedControl} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey} from '@/app/utils/elections';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';

type Pov = 'dem' | 'rep';

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

// "The intensity of coloring shows disproportionality cutoffs at 15 and 25 percentage points;
// efficiency gap cutoffs at 8 and 20 percentage points, MM at 3 points, PB at 5 seats (0.179)
// and 7 seats (0.250), and Eguia at 20 and 30 points." — Moon, Florida redistricting report.
// We scale to the lower cutoff (full intensity at that threshold); upper cutoff is ignored.
const METRIC_CUTOFF = {
  disp:            0.15,
  efficiency_gap:  0.08,
  mean_median:     0.03,
  partisan_bias:   0.179,
  eguia:           0.20,
} as const;

const MAX_ALPHA = 0.6;

// All metrics are dem-POV: positive = dem advantage (blue), negative = rep advantage (red).
const scaledBg = (value: number | undefined, cutoff: number) => {
  if (value == null) return undefined;
  const alpha = Math.min(Math.abs(value) / cutoff, 1.0) * MAX_ALPHA;
  if (value > 0) return demBg(alpha);
  if (value < 0) return repBg(alpha);
  return undefined;
};

function dispLabel(disp: number, numDistricts: number): string {
  const seatLean = disp * numDistricts;
  if (Math.abs(seatLean) < 0.05) return 'As proportional as possible';
  const abs = Math.abs(seatLean).toFixed(1);
  return seatLean > 0
    ? `Skews Democrat by ${abs} seats`
    : `Skews Republican by ${abs} seats`;
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

export const PartisanSection: React.FC<Props> = ({evaluation}) => {
  const [pov, setPov] = useState<Pov>('dem');
  const elections = sortElections(Object.keys(evaluation.seats ?? {}));
  const n = elections.length;
  const competitiveness = evaluation.competitiveness;
  if (!n && !competitiveness) return null;

  const povColor = pov === 'dem' ? DEM : REP;
  const povBg = pov === 'dem' ? demBg : repBg;
  // For signed metrics (dem-POV): positive = dem advantage. Rep POV negates.
  const povSign = (v: number | undefined) => (v != null && pov === 'rep' ? -v : v);

  const firstSeats = n > 0 ? evaluation.seats?.[elections[0]] : null;
  const numDistricts = firstSeats?.total ?? null;

  const avgSeatLean =
    n > 0 && evaluation.disproportionality && numDistricts !== null
      ? elections.reduce((sum, key) => {
          return sum + (evaluation.disproportionality![key] ?? 0) * numDistricts;
        }, 0) / n
      : null;

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
              <Heading size="2" align="center" mb="2" mt="4">Proportionality</Heading>
              <Flex align="center" gap="2" mb="3" justify="end">
                <Text size="1" color="gray">Point of View</Text>
                <SegmentedControl.Root
                  size="1"
                  value={pov}
                  onValueChange={v => setPov(v as Pov)}
                >
                  <SegmentedControl.Item value="dem">Democrat</SegmentedControl.Item>
                  <SegmentedControl.Item value="rep">Republican</SegmentedControl.Item>
                </SegmentedControl.Root>
              </Flex>
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
                    <Table.ColumnHeaderCell justify="center" style={{color: povColor}}>
                      Votes
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: povColor}}>
                      Vote<br />Share
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: povColor}}>
                      Seats
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="center" style={{color: povColor}}>
                      Seat<br />Share
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">
                      Disproportionality
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {elections.map(key => {
                    const seats = evaluation.seats?.[key];
                    const seatTotal = seats?.total ?? null;
                    const partySeatCount = seats?.[pov] ?? null;
                    const seatPct = seatTotal && partySeatCount != null ? partySeatCount / seatTotal : null;
                    const votes = evaluation.votes?.[key];
                    const partyVoteCount = votes?.[pov] ?? null;
                    const voteShare = evaluation.vote_shares?.[key]?.[pov] ?? null;
                    const rawDisp = evaluation.disproportionality?.[key] ?? null;
                    const disp = rawDisp !== null ? (pov === 'rep' ? -rawDisp : rawDisp) : null;
                    return (
                      <Table.Row key={key}>
                        <Table.Cell>
                          <Text size="2" weight="bold">{formatElectionKey(key)}</Text>
                        </Table.Cell>
                        <Table.Cell justify="center">
                          <Text size="2">
                            {partyVoteCount != null && votes
                              ? `${formatNumber(partyVoteCount, NUMBER_FORMATS.COMPACT)}/${formatNumber(votes.total, NUMBER_FORMATS.COMPACT)}`
                              : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{backgroundColor: voteShare != null
                            ? voteShare > 0.5 ? povBg((voteShare - 0.5) * 1.5) : NEUTRAL
                            : undefined}}
                        >
                          <Text size="2">
                            {voteShare != null ? `${(voteShare * 100).toFixed(1)}%` : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell justify="center">
                          <Text size="2">
                            {partySeatCount != null && seatTotal
                              ? `${partySeatCount}/${seatTotal}`
                              : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={seatPct !== null
                            ? {backgroundColor: seatPct > 0.5 ? povBg((seatPct - 0.5) * 1.5) : NEUTRAL}
                            : {}}
                        >
                          <Text size="2">
                            {seatPct !== null ? `${(seatPct * 100).toFixed(1)}%` : '—'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="end"
                          style={{backgroundColor: scaledBg(rawDisp ?? undefined, METRIC_CUTOFF.disp)}}
                        >
                          <Text size="2">
                            {disp !== null && numDistricts !== null
                              ? dispLabel(rawDisp!, numDistricts)
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
              <Heading size="2" align="center" mb="2" mt="4">Other Partisanship Metrics</Heading>
              <Text size="2" mb="3" as="p">
                The following scores can all be found in the political science literature, but are
                not necessarily endorsed by leading scholars at this time.
              </Text>
              <Table.Root size="1" mb="3">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Election</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Dispropor-<br />tionality</Table.ColumnHeaderCell>
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
                      <Table.Cell justify="end" style={{backgroundColor: scaledBg(evaluation.disproportionality?.[key], METRIC_CUTOFF.disp)}}>
                        <Text size="2">{formatNumber(povSign(evaluation.disproportionality?.[key]), NUMBER_FORMATS.SIGNED_PCT)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: scaledBg(evaluation.efficiency_gap?.[key], METRIC_CUTOFF.efficiency_gap)}}>
                        <Text size="2">{formatNumber(povSign(evaluation.efficiency_gap?.[key]), NUMBER_FORMATS.SIGNED_PCT)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: scaledBg(evaluation.mean_median?.[key], METRIC_CUTOFF.mean_median)}}>
                        <Text size="2">{formatNumber(povSign(evaluation.mean_median?.[key]), NUMBER_FORMATS.SIGNED_PCT)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: scaledBg(evaluation.partisan_bias?.[key], METRIC_CUTOFF.partisan_bias)}}>
                        <Text size="2">{formatNumber(povSign(evaluation.partisan_bias?.[key]), NUMBER_FORMATS.SIGNED_PCT)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end" style={{backgroundColor: scaledBg(evaluation.eguia?.[key], METRIC_CUTOFF.eguia)}}>
                        <Text size="2">{formatNumber(povSign(evaluation.eguia?.[key]), NUMBER_FORMATS.SIGNED_PCT)}</Text>
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
              <Heading size="2" align="center" mb="2" mt="4">Competitiveness</Heading>
              <Text size="2" mb="3" as="p">
                Competitiveness measures how many districts are closely contested. A swing district
                is one where the result could plausibly change with a small shift in the statewide
                vote.
              </Text>
              <Table.Root size="1">
                <Table.Body>
                  <Table.Row>
                    <Table.Cell><Text size="2">Elections analyzed</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">{competitiveness.n_elections}</Text>
                    </Table.Cell>
                  </Table.Row>
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
                      <Text size="2" weight="bold">
                        {competitiveness.n_swing_districts} / {competitiveness.n_districts}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2">Safe Dem districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">
                        {competitiveness.n_dem_districts} / {competitiveness.n_districts}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                  <Table.Row>
                    <Table.Cell><Text size="2">Safe Rep districts</Text></Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold">
                        {competitiveness.n_rep_districts} / {competitiveness.n_districts}
                      </Text>
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
