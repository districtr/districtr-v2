'use client';
import {Fragment, useState} from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading, Select} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey, selectFtvElections} from '@/app/utils/elections';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';
import {PovSwitcher, type Pov} from '@components/Shared/PovSwitcher';
import {getReadableTextColor} from '@/app/utils/colors';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';
import {HOVER_BTN_STYLE} from './hoverTriggerStyle';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';

interface PartisanSectionProps {
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
  disp: 0.15,
  efficiency_gap: 0.08,
  mean_median: 0.03,
  partisan_bias: 0.179,
  eguia: 0.2,
} as const;

const MAX_ALPHA = 0.6;

// Highlights a Disproportionality cell in either table above/below while the "4 recent
// statewide elections" trigger is hovered, so the reader can see exactly which rows the
// FTV verdict sentence is talking about.
const ftvCellHighlight = (isFtvElection: boolean): React.CSSProperties =>
  isFtvElection ? {boxShadow: 'inset 0 0 0 2px var(--accent-9)'} : {};

// All metrics are dem-POV: positive = dem advantage (blue), negative = rep advantage (red).
const scaledBg = (value: number | undefined, cutoff: number) => {
  if (value == null) return undefined;
  const alpha = Math.min(Math.abs(value) / cutoff, 1.0) * MAX_ALPHA;
  if (value > 0) return demBg(alpha);
  if (value < 0) return repBg(alpha);
  return undefined;
};

// Mirrors scaledBg's alpha calculation so cells near MAX_ALPHA (dark) get
// readable white text instead of the default dark text.
const scaledTextColor = (value: number | undefined, cutoff: number) => {
  if (value == null) return undefined;
  const alpha = Math.min(Math.abs(value) / cutoff, 1.0) * MAX_ALPHA;
  return getReadableTextColor(value > 0 ? DEM : REP, alpha);
};

function dispLabel(disp: number, numDistricts: number): string {
  const seatLean = disp * numDistricts;
  if (Math.abs(seatLean) < 0.05) return 'As proportional as possible';
  const abs = Math.abs(seatLean).toFixed(1);
  return seatLean > 0 ? `Skews Democratic by ${abs} seats` : `Skews Republican by ${abs} seats`;
}

const LEVEL_ORDER: Record<string, number> = {pres: 0, sen: 1, gov: 2, ag: 3};

function sortElections(keys: string[]): string[] {
  return keys
    .filter(k => k.split('_')[0] in LEVEL_ORDER) // Only show statewide elections
    .sort((a, b) => {
      const aParts = a.split('_'),
        bParts = b.split('_');
      const aYear = Number(aParts[aParts.length - 1]);
      const bYear = Number(bParts[bParts.length - 1]);
      if (bYear !== aYear) return bYear - aYear; // descending year
      const aLevel = LEVEL_ORDER[aParts[0]] ?? 99;
      const bLevel = LEVEL_ORDER[bParts[0]] ?? 99;
      return aLevel - bLevel; // pres < sen < gov
    });
}

export const PartisanSection: React.FC<PartisanSectionProps> = ({evaluation}) => {
  const [pov, setPov] = useState<Pov>('dem');
  const [ftvHover, setFtvHover] = useState(false);
  const [ftvPassHover, setFtvPassHover] = useState(false);
  const [hoveredFtvKey, setHoveredFtvKey] = useState<string | null>(null);
  const [competitiveBand, setCompetitiveBand] = useState('3');
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();
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

  const ftv = selectFtvElections(Object.keys(evaluation.seats ?? {}));
  const ftvThreshold = ftv && numDistricts ? Math.max(0.07, 1 / numDistricts) : null;
  const ftvPassingKeys =
    ftv && ftvThreshold !== null
      ? new Set(
          [...ftv.pres, ...ftv.sen].filter(key => {
            const disprop = evaluation.disproportionality?.[key];
            return disprop !== undefined && Math.abs(disprop) <= ftvThreshold;
          })
        )
      : null;
  const ftvPassCount = ftvPassingKeys ? ftvPassingKeys.size : null;
  const ftvOverallPass = ftvPassCount !== null ? ftvPassCount >= 3 : null;
  const ftvElections = ftv ? [...ftv.pres, ...ftv.sen] : [];
  const ftvKeySet = ftv ? new Set(ftvElections) : null;
  const isFtvHighlighted = (key: string) =>
    (ftvHover && !!ftvKeySet?.has(key)) ||
    (ftvPassHover && !!ftvPassingKeys?.has(key)) ||
    hoveredFtvKey === key;
  // The bound is 1/k seats when that's looser than the flat 7% floor — state it
  // in whichever form is actually binding, rather than always the raw percentage.
  const ftvBoundPhrase =
    ftvThreshold !== null && numDistricts !== null
      ? 1 / numDistricts > 0.07
        ? `1 out of ${numDistricts} seats (${(ftvThreshold * 100).toFixed(1)}% of the seat share)`
        : '7%'
      : null;

  // Shared between both branches of the FTV sentence below (scored and
  // not-enough-data) so the HelpTip trigger isn't duplicated.
  const ftvHelpTipTrigger = (
    <HelpTip tip="freedomToVoteTest" openDelay={HELP_TIP_FAST_DELAY}>
      <span role="button" tabIndex={0} style={HOVER_BTN_STYLE}>
        Freedom-To-Vote Test
      </span>
    </HelpTip>
  );

  // FTV table always shows the Republican share — independent of the pov
  // toggle above, since the "Repub tilt"/"Dem tilt" verdict wording already
  // names the party, leaving nothing for pov to flip.
  const repVoteShare = (key: string) => {
    const dem = evaluation.vote_shares?.[key]?.dem;
    return dem !== undefined ? 1 - dem : null;
  };
  const repSeatShare = (key: string) => {
    const s = evaluation.seats?.[key];
    return s && s.total ? 1 - s.dem / s.total : null;
  };
  const ftvVerdict = (key: string): 'pass' | 'dem' | 'rep' | null => {
    const disprop = evaluation.disproportionality?.[key];
    if (disprop === undefined || ftvThreshold === null) return null;
    if (Math.abs(disprop) <= ftvThreshold) return 'pass';
    return disprop > 0 ? 'dem' : 'rep';
  };

  const avgSeatSkew =
    n > 0 && evaluation.disproportionality && numDistricts !== null
      ? elections.reduce((sum, key) => {
          return sum + (evaluation.disproportionality![key] ?? 0) * numDistricts;
        }, 0) / n
      : null;

  // Sweep/swing status doesn't depend on the band (plain-majority win/loss per
  // election); only which contests count as "competitive" does, so that's the
  // one thing the band dropdown re-filters client-side.
  const demSweepDistricts = competitiveness?.dem_sweep_districts ?? [];
  const repSweepDistricts = competitiveness?.rep_sweep_districts ?? [];
  const swingDistricts = competitiveness?.swing_districts ?? [];
  const contestDemVoteShares = competitiveness?.contest_dem_vote_shares ?? [];
  // Read directly from the metric rather than summing the three lists, so this
  // stays correct even when there's no election data (n_districts can be > 0
  // while every list above is empty) and doesn't assume this metric's election
  // count agrees with any other metric's.
  const nDistrictsTotal = competitiveness?.n_districts ?? 0;
  const nElectionsAnalyzed = competitiveness?.n_elections ?? 0;
  const competitiveBandFraction = Number(competitiveBand) / 100;
  const nCompetitiveContests = contestDemVoteShares.filter(
    s => Math.abs(s - 0.5) <= competitiveBandFraction
  ).length;

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="partisan">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full group" py="2">
            <TriangleRightIcon
              width={16}
              height={16}
              className="transition-transform duration-200 group-data-[state=open]:rotate-90"
            />
            <Heading size="5">Election Results and Partisanship</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content className="pl-8">
          {n > 0 && (
            <Text size="2" mb="3" as="p">
              Our current dataset contains{' '}
              <strong>
                {n} recent statewide election{n !== 1 ? 's' : ''}
              </strong>
              .{' '}
            </Text>
          )}

          {/* Proportionality */}
          {n > 0 && (
            <>
              <Heading size="3" align="center" mb="2" mt="4">
                Proportionality
              </Heading>
              <Text size="2" mb="3" as="p">
                Relative to proportionality, your plan has an average skew of{' '}
                {avgSeatSkew !== null ? (
                  <>
                    <strong>{Math.abs(avgSeatSkew).toFixed(1)} seats</strong> towards{' '}
                    {avgSeatSkew >= 0 ? 'Democrats' : 'Republicans'}
                  </>
                ) : (
                  '—'
                )}{' '}
                over these elections.
              </Text>
              <Text size="2" weight="bold" mb="2" as="p">
                Votes vs. Seats by Election (among the two major parties)
              </Text>
              <Flex mb="2">
                <PovSwitcher pov={pov} setPov={setPov} />
              </Flex>
              <div style={{width: 'fit-content', overflowX: 'auto', maxWidth: '100%'}}>
                <Table.Root size="1" mb="3" variant="surface">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell justify="center">Election</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">
                        Total (D+R)
                        <br />
                        Votes
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell
                        justify="center"
                        style={{color: povColor, width: '8ch'}}
                      >
                        {pov === 'dem' ? 'Dem' : 'Repub'} Vote
                        <br />
                        Share
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell
                        justify="center"
                        style={{color: povColor, width: '8ch'}}
                      >
                        {pov === 'dem' ? 'Dem' : 'Repub'}
                        <br />
                        Districts
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell
                        justify="center"
                        style={{color: povColor, width: '8ch'}}
                      >
                        {pov === 'dem' ? 'Dem' : 'Repub'} Seat
                        <br />
                        Share
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={{minWidth: '22ch'}}>
                        Disproportionality
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {elections.map(key => {
                      const seats = evaluation.seats?.[key];
                      const seatTotal = seats?.total ?? null;
                      const partySeatCount = seats?.[pov] ?? null;
                      const seatPct =
                        seatTotal && partySeatCount != null ? partySeatCount / seatTotal : null;
                      const votes = evaluation.votes?.[key];
                      const voteShare = evaluation.vote_shares?.[key]?.[pov] ?? null;
                      const rawDisp = evaluation.disproportionality?.[key] ?? null;
                      const disp = rawDisp !== null ? (pov === 'rep' ? -rawDisp : rawDisp) : null;
                      return (
                        <Table.Row key={key}>
                          <Table.Cell justify="center">
                            <Text size="2" weight="bold">
                              {formatElectionKey(key)}
                            </Text>
                          </Table.Cell>
                          <Table.Cell justify="center">
                            <Text size="2">
                              {votes != null ? votes.total.toLocaleString() : '—'}
                            </Text>
                          </Table.Cell>
                          <Table.Cell
                            justify="center"
                            style={{
                              backgroundColor:
                                voteShare != null
                                  ? voteShare > 0.5
                                    ? povBg((voteShare - 0.5) * 1.5)
                                    : NEUTRAL
                                  : undefined,
                              ...ftvCellHighlight(isFtvHighlighted(key)),
                            }}
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
                            style={{
                              ...(seatPct !== null
                                ? {
                                    backgroundColor:
                                      seatPct > 0.5 ? povBg((seatPct - 0.5) * 1.5) : NEUTRAL,
                                  }
                                : {}),
                              ...ftvCellHighlight(isFtvHighlighted(key)),
                            }}
                          >
                            <Text size="2">
                              {seatPct !== null ? `${(seatPct * 100).toFixed(1)}%` : '—'}
                            </Text>
                          </Table.Cell>
                          <Table.Cell
                            justify="center"
                            style={{
                              backgroundColor: scaledBg(rawDisp ?? undefined, METRIC_CUTOFF.disp),
                              color: scaledTextColor(rawDisp ?? undefined, METRIC_CUTOFF.disp),
                              ...ftvCellHighlight(isFtvHighlighted(key)),
                            }}
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
              </div>
            </>
          )}

          {n > 0 && (
            <>
              {ftvPassCount === null && (
                <Text size="2" mb="3" as="p">
                  Not enough recent Presidential and Senate election data is available to score this
                  plan against the {ftvHelpTipTrigger}.
                </Text>
              )}
              {ftvPassCount !== null && (
                <>
                  <Text size="2" mb="2" as="p">
                    This plan <strong>{ftvOverallPass ? 'PASSES' : 'DOES NOT PASS'}</strong> the{' '}
                    {ftvHelpTipTrigger} for partisan balance. To see why, we use{' '}
                    <span
                      role="button"
                      tabIndex={0}
                      style={HOVER_BTN_STYLE}
                      onMouseEnter={() => setFtvHover(true)}
                      onMouseLeave={() => setFtvHover(false)}
                      onFocus={() => setFtvHover(true)}
                      onBlur={() => setFtvHover(false)}
                    >
                      the last two Senate races and the last two Presidential races
                    </span>{' '}
                    as our test contests (
                    {ftvElections.map((key, i) => (
                      <Fragment key={key}>
                        {i > 0 && (i === ftvElections.length - 1 ? ', and ' : ', ')}
                        <span
                          role="button"
                          tabIndex={0}
                          style={HOVER_BTN_STYLE}
                          onMouseEnter={() => setHoveredFtvKey(key)}
                          onMouseLeave={() => setHoveredFtvKey(null)}
                          onFocus={() => setHoveredFtvKey(key)}
                          onBlur={() => setHoveredFtvKey(null)}
                        >
                          {formatElectionKey(key)}
                        </span>
                      </Fragment>
                    ))}
                    ). We check if the seat share would have been proportional to the vote share in
                    those contests, up to an allowed bound of <strong>{ftvBoundPhrase}</strong>.
                  </Text>
                  <div style={{width: 'fit-content', overflowX: 'auto', maxWidth: '100%'}}>
                    <Table.Root size="1" mb="2" variant="surface">
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeaderCell justify="center" />
                          {ftvElections.map(key => (
                            <Table.ColumnHeaderCell key={key} justify="center">
                              {formatElectionKey(key)}
                            </Table.ColumnHeaderCell>
                          ))}
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        <Table.Row>
                          <Table.Cell>
                            <Text size="2" weight="bold">
                              R vote share
                            </Text>
                          </Table.Cell>
                          {ftvElections.map(key => (
                            <Table.Cell key={key} justify="center">
                              <Text size="2">
                                {repVoteShare(key) !== null
                                  ? `${(repVoteShare(key)! * 100).toFixed(1)}%`
                                  : '—'}
                              </Text>
                            </Table.Cell>
                          ))}
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>
                            <Text size="2" weight="bold">
                              R seat share
                            </Text>
                          </Table.Cell>
                          {ftvElections.map(key => (
                            <Table.Cell key={key} justify="center">
                              <Text size="2">
                                {repSeatShare(key) !== null
                                  ? `${(repSeatShare(key)! * 100).toFixed(1)}%`
                                  : '—'}
                              </Text>
                            </Table.Cell>
                          ))}
                        </Table.Row>
                        <Table.Row>
                          <Table.Cell>
                            <Text size="2" weight="bold">
                              Close enough?
                            </Text>
                          </Table.Cell>
                          {ftvElections.map(key => {
                            const verdict = ftvVerdict(key);
                            return (
                              <Table.Cell key={key} justify="center">
                                <Text
                                  size="2"
                                  style={{
                                    color:
                                      verdict === 'dem'
                                        ? DEM
                                        : verdict === 'rep'
                                          ? REP
                                          : 'var(--green-9)',
                                  }}
                                >
                                  {verdict === 'pass'
                                    ? '✓'
                                    : verdict === 'dem'
                                      ? 'Dem tilt'
                                      : verdict === 'rep'
                                        ? 'Repub tilt'
                                        : '—'}
                                </Text>
                              </Table.Cell>
                            );
                          })}
                        </Table.Row>
                      </Table.Body>
                    </Table.Root>
                  </div>
                  <Text size="2" mb="3" as="p">
                    This is close enough{' '}
                    <span
                      role="button"
                      tabIndex={0}
                      style={{...HOVER_BTN_STYLE, fontWeight: 'bold'}}
                      onMouseEnter={() => setFtvPassHover(true)}
                      onMouseLeave={() => setFtvPassHover(false)}
                      onFocus={() => setFtvPassHover(true)}
                      onBlur={() => setFtvPassHover(false)}
                    >
                      {ftvPassCount} out of 4 times
                    </span>
                    , so it {ftvOverallPass ? 'passes' : 'does not pass'} the test. (3 out of 4 are
                    needed to pass.)
                  </Text>
                </>
              )}

              {/* Other Partisanship Metrics */}
              <Heading size="3" align="center" mb="2" mt="4">
                Other Partisanship Metrics
              </Heading>
              <Flex mb="2">
                <PovSwitcher pov={pov} setPov={setPov} />
              </Flex>
              <div style={{overflowX: 'auto', maxWidth: '100%', width: 'fit-content'}}>
                <Table.Root
                  size="1"
                  mb="3"
                  variant="surface"
                  style={{tableLayout: 'fixed', width: '58ch'}}
                >
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell justify="center" style={{width: '10ch'}}>
                        Election
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={{width: '9ch'}}>
                        Dispropor-
                        <br />
                        tionality
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={{width: '9ch'}}>
                        Efficiency
                        <br />
                        Gap
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={{width: '9ch'}}>
                        Mean
                        <br />
                        Median
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={{width: '9ch'}}>
                        Partisan
                        <br />
                        Bias
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={{width: '9ch'}}>
                        Eguia&apos;s
                        <br />
                        Metric
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {elections.map(key => (
                      <Table.Row key={key}>
                        <Table.Cell justify="center">
                          <Text size="2" weight="bold">
                            {formatElectionKey(key)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{
                            backgroundColor: scaledBg(
                              evaluation.disproportionality?.[key],
                              METRIC_CUTOFF.disp
                            ),
                            color: scaledTextColor(
                              evaluation.disproportionality?.[key],
                              METRIC_CUTOFF.disp
                            ),
                            ...ftvCellHighlight(isFtvHighlighted(key)),
                          }}
                        >
                          <Text size="2">
                            {formatNumber(
                              povSign(evaluation.disproportionality?.[key]),
                              NUMBER_FORMATS.SIGNED_PCT
                            )}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{
                            backgroundColor: scaledBg(
                              evaluation.efficiency_gap?.[key],
                              METRIC_CUTOFF.efficiency_gap
                            ),
                            color: scaledTextColor(
                              evaluation.efficiency_gap?.[key],
                              METRIC_CUTOFF.efficiency_gap
                            ),
                          }}
                        >
                          <Text size="2">
                            {formatNumber(
                              povSign(evaluation.efficiency_gap?.[key]),
                              NUMBER_FORMATS.SIGNED_PCT
                            )}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{
                            backgroundColor: scaledBg(
                              evaluation.mean_median?.[key],
                              METRIC_CUTOFF.mean_median
                            ),
                            color: scaledTextColor(
                              evaluation.mean_median?.[key],
                              METRIC_CUTOFF.mean_median
                            ),
                          }}
                        >
                          <Text size="2">
                            {formatNumber(
                              povSign(evaluation.mean_median?.[key]),
                              NUMBER_FORMATS.SIGNED_PCT
                            )}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{
                            backgroundColor: scaledBg(
                              evaluation.partisan_bias?.[key],
                              METRIC_CUTOFF.partisan_bias
                            ),
                            color: scaledTextColor(
                              evaluation.partisan_bias?.[key],
                              METRIC_CUTOFF.partisan_bias
                            ),
                          }}
                        >
                          <Text size="2">
                            {formatNumber(
                              povSign(evaluation.partisan_bias?.[key]),
                              NUMBER_FORMATS.SIGNED_PCT
                            )}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{
                            backgroundColor: scaledBg(evaluation.eguia?.[key], METRIC_CUTOFF.eguia),
                            color: scaledTextColor(evaluation.eguia?.[key], METRIC_CUTOFF.eguia),
                          }}
                        >
                          <Text size="2">
                            {formatNumber(
                              povSign(evaluation.eguia?.[key]),
                              NUMBER_FORMATS.SIGNED_PCT
                            )}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </>
          )}

          {/* Competitiveness Metrics */}
          {competitiveness && (
            <>
              <Heading size="3" align="center" mb="2" mt="4">
                Competitiveness
              </Heading>
              <Text size="2" mb="3" as="p">
                A district is considered <strong>competitive</strong> in a particular vote pattern
                if it&apos;s close to 50-50 within the major parties — more specifically, if its
                vote shares deviate from even by an amount within{' '}
                <Select.Root value={competitiveBand} onValueChange={setCompetitiveBand} size="1">
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="2">±2 points</Select.Item>
                    <Select.Item value="3">±3 points</Select.Item>
                    <Select.Item value="5">±5 points</Select.Item>
                    <Select.Item value="7">±7 points</Select.Item>
                    <Select.Item value="10">±10 points</Select.Item>
                  </Select.Content>
                </Select.Root>
                . We call a district a <strong>swing</strong> district if each major party won it at
                least once over the elections in our dataset. If it was always won by the same party
                across those contests, we label it as <strong>Dem Sweep</strong> or{' '}
                <strong>Repub Sweep</strong>.
              </Text>
              <div style={{width: 'fit-content'}}>
                <Table.Root size="1" variant="surface">
                  <Table.Body>
                    <Table.Row>
                      <Table.Cell justify="center">
                        <Text size="2">Elections analyzed</Text>
                      </Table.Cell>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold">
                          {nElectionsAnalyzed}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell justify="center">
                        <Text size="2">Competitive contests</Text>
                      </Table.Cell>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold">
                          {nCompetitiveContests} / {contestDemVoteShares.length}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row
                      tabIndex={0}
                      style={{cursor: 'pointer'}}
                      onMouseEnter={() => onDistrictEnter(swingDistricts)}
                      onMouseLeave={onDistrictLeave}
                      onFocus={() => onDistrictEnter(swingDistricts)}
                      onBlur={onDistrictLeave}
                    >
                      <Table.Cell justify="center">
                        <Text size="2">Swing districts</Text>
                      </Table.Cell>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold" style={HOVER_BTN_STYLE}>
                          {swingDistricts.length} / {nDistrictsTotal}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row
                      tabIndex={0}
                      style={{cursor: 'pointer'}}
                      onMouseEnter={() => onDistrictEnter(demSweepDistricts)}
                      onMouseLeave={onDistrictLeave}
                      onFocus={() => onDistrictEnter(demSweepDistricts)}
                      onBlur={onDistrictLeave}
                    >
                      <Table.Cell justify="center">
                        <Text size="2">Dem Sweep districts</Text>
                      </Table.Cell>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold" style={HOVER_BTN_STYLE}>
                          {demSweepDistricts.length} / {nDistrictsTotal}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                    <Table.Row
                      tabIndex={0}
                      style={{cursor: 'pointer'}}
                      onMouseEnter={() => onDistrictEnter(repSweepDistricts)}
                      onMouseLeave={onDistrictLeave}
                      onFocus={() => onDistrictEnter(repSweepDistricts)}
                      onBlur={onDistrictLeave}
                    >
                      <Table.Cell justify="center">
                        <Text size="2">Repub sweep districts</Text>
                      </Table.Cell>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold" style={HOVER_BTN_STYLE}>
                          {repSweepDistricts.length} / {nDistrictsTotal}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  </Table.Body>
                </Table.Root>
              </div>
            </>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
