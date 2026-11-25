'use client';
import {EvalSection, EvalSubheading, EvalTableTitle} from './EvalSection';
import {EVAL_OPTION_VALUES, type EvalOptions, useEvalOption, useIsReport} from './evalMode';
import {DATA_SOURCE_NOTES, ReportNoteRef} from './ReportNotes';
import {helpTipContent} from '@components/HelpTip/helpTipContent';
import NextLink from 'next/link';
import {CheckIcon, Cross2Icon} from '@radix-ui/react-icons';
import {Flex, Link, Text, Table, HoverCard, Select} from '@radix-ui/themes';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey, parseElectionKey, selectFtvElections} from '@/app/utils/elections';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';
import {PovSwitcher, type Pov} from '@components/Shared/PovSwitcher';
import {getReadableTextColor} from '@/app/utils/colors';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';
import {HOVER_BTN_STYLE, HoverTrigger} from './HoverTrigger';
import {isPlanComplete} from './planCompleteness';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {useEditableDocId} from '@/app/hooks/useEditableDocId';
import {useMapStore} from '@store/mapStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {MAP_ROUTES} from '@constants/document/routes';
import {editPath, readPath} from '@utils/map/editUrl';

interface PartisanSectionProps {
  evaluation: DocumentEvaluation;
}

const DEM = '#2563eb';
const REP = '#dc2626';
const NEUTRAL = 'rgba(128, 128, 128, 0.08)';
// An icon that stands in a line of text, like a character.
const VERDICT_ICON_STYLE: React.CSSProperties = {display: 'inline', verticalAlign: 'text-bottom'};

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

// A pointer that only crosses the election count on its way elsewhere opens nothing.
const ELECTION_LIST_OPEN_DELAY_MS = 150;

// Slack for threshold comparisons so a share sitting exactly on a cutoff
// isn't flipped by floating-point rounding.
const FLOAT_TOLERANCE = 1e-9;

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

/** The test's name: a help tip on screen, a numbered note in the report. */
const FtvTestName: React.FC = () => {
  const isReport = useIsReport();
  if (isReport) {
    return (
      <>
        Freedom-To-Vote Test
        <ReportNoteRef
          note="freedomToVoteTest"
          title={helpTipContent.freedomToVoteTest.title}
          text={helpTipContent.freedomToVoteTest.text}
        />
      </>
    );
  }
  return (
    <HelpTip tip="freedomToVoteTest" openDelay={HELP_TIP_FAST_DELAY}>
      <button type="button" style={HOVER_BTN_STYLE}>
        Freedom-To-Vote Test
      </button>
    </HelpTip>
  );
};

type ElectionShowMode = EvalOptions['electionShowMode'];
const ELECTION_SHOW_MODE_LABEL: Record<ElectionShowMode, string> = {
  all: 'All elections',
  'ftv-only': 'FTV elections',
};

/** Seat share minus vote share as points towards a party, e.g. "6.0% D". */
const formatFtvDiff = (demDisproportionality: number): string => {
  const points = (Math.abs(demDisproportionality) * 100).toFixed(1);
  if (Number(points) === 0) return `${points}%`;
  return `${points}% ${demDisproportionality > 0 ? 'D' : 'R'}`;
};

/** "a, b, and c". */
const joinWithAnd = (items: string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

/** A share as a percentage with no trailing ".0", e.g. "7%" or "12.5%". */
const formatThreshold = (share: number): string => `${Number((share * 100).toFixed(1))}%`;

const LEVEL_ORDER: Record<string, number> = {pres: 0, sen: 1, gov: 2, ag: 3};

function sortElections(keys: string[]): string[] {
  return keys
    .map(parseElectionKey)
    .filter(e => e.type in LEVEL_ORDER) // Only show statewide elections
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year; // descending year
      return (LEVEL_ORDER[a.type] ?? 99) - (LEVEL_ORDER[b.type] ?? 99); // pres < sen < gov
    })
    .map(e => e.key);
}

export const PartisanSection: React.FC<PartisanSectionProps> = ({evaluation}) => {
  const isReport = useIsReport();
  const [pov, setPov] = useEvalOption('pov');
  const povName = pov === 'dem' ? 'Democratic' : 'Republican';
  const [electionShowMode, setElectionShowMode] = useEvalOption('electionShowMode');
  const [competitiveBand, setCompetitiveBand] = useEvalOption('competitiveBand');
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();
  const planDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const publicId = useMapStore(state => state.mapDocument?.public_id ?? null);
  const editDocId = useEditableDocId();
  const setSuperDraw = useToolbarStore(state => state.setSuperDraw);
  const elections = sortElections(Object.keys(evaluation.seats ?? {}));
  const n = elections.length;
  const competitiveness = evaluation.competitiveness;
  if (!n && !competitiveness) return null;

  // Vote and seat figures of an unfinished plan describe only its drawn part, so the
  // section points to where the plan is finished and where the drawn part's election
  // results are: the sidebar of Draw mode, or of View mode for a reader who cannot edit.
  if (isPlanComplete(evaluation, planDistricts) === false) {
    // Like the mode switcher's Draw entry, the link to Draw mode leaves Super Draw.
    const mapLink = editDocId
      ? {
          href: editPath(MAP_ROUTES.DISTRICTS, editDocId, publicId),
          label: 'Go to Draw mode',
          onClick: () => setSuperDraw(false),
        }
      : publicId !== null
        ? {
            href: readPath(MAP_ROUTES.DISTRICTS, publicId),
            label: 'Go to View mode',
            onClick: undefined,
          }
        : null;
    return (
      <EvalSection value="partisan" title="Election Results and Partisanship">
        <Text size="2" as="p">
          The partisan metrics are hidden for incomplete plans.
          {!isReport && mapLink && (
            <>
              {' '}
              <Link asChild>
                <NextLink href={mapLink.href} onClick={mapLink.onClick}>
                  {mapLink.label}
                </NextLink>
              </Link>{' '}
              {editDocId && 'to finish the plan, or '}to see the election results of the districts
              drawn so far, under Stats → Elections.
            </>
          )}
        </Text>
      </EvalSection>
    );
  }

  const povColor = pov === 'dem' ? DEM : REP;
  const povBg = pov === 'dem' ? demBg : repBg;
  // For signed metrics (dem-POV): positive = dem advantage. Rep POV negates.
  const povSign = (v: number | undefined) => (v != null && pov === 'rep' ? -v : v);

  const firstSeats = n > 0 ? evaluation.seats?.[elections[0]] : null;
  const numDistricts = firstSeats?.total ?? null;

  const ftv = selectFtvElections(Object.keys(evaluation.seats ?? {}));
  const ftvThreshold = ftv && numDistricts ? Math.max(0.07, 1 / numDistricts) : null;
  const ftvElections = ftv ? [...ftv.pres, ...ftv.sen] : [];
  // The Proportionality and Other Partisanship Metrics tables list every election or
  // only the test's; the Freedom-To-Vote table always lists the test's.
  const onlyFtvElections = ftv !== null && electionShowMode === 'ftv-only';
  const tableElections = onlyFtvElections
    ? elections.filter(key => ftvElections.includes(key))
    : elections;
  // A missing disproportionality value (the backend metric raises on an
  // election with zero D+R votes, isolated per-metric) must not silently
  // score as a failed contest — treat it the same as "not enough data".
  const ftvHasCompleteData =
    ftv &&
    ftvThreshold !== null &&
    ftvElections.every(key => evaluation.disproportionality?.[key] !== undefined);
  const ftvPassingKeys = ftvHasCompleteData
    ? new Set(
        ftvElections.filter(
          key => Math.abs(evaluation.disproportionality![key]) <= ftvThreshold! + FLOAT_TOLERANCE
        )
      )
    : null;
  const ftvPassCount = ftvPassingKeys ? ftvPassingKeys.size : null;
  const ftvOverallPass = ftvPassCount !== null ? ftvPassCount >= 3 : null;
  // The bound is 1/k seats when that's looser than the flat 7% floor — state it
  // in whichever form is actually binding, rather than always the raw percentage.
  const ftvBoundPhrase =
    ftvThreshold !== null && numDistricts !== null
      ? 1 / numDistricts > 0.07
        ? `1 out of ${numDistricts} seats (${(ftvThreshold * 100).toFixed(1)}% of the seat share)`
        : '7%'
      : null;

  // FTV table's vote/seat share rows follow the pov toggle, same as the
  // Proportionality table. The difference and the "R tilt"/"D tilt" verdict
  // stay fixed either way: they name whichever party is actually favored.
  const povVoteShare = (key: string) => {
    const dem = evaluation.vote_shares?.[key]?.dem;
    if (dem === undefined) return null;
    return pov === 'dem' ? dem : 1 - dem;
  };
  const povSeatShare = (key: string) => {
    const s = evaluation.seats?.[key];
    if (!s || !s.total) return null;
    const demShare = s.dem / s.total;
    return pov === 'dem' ? demShare : 1 - demShare;
  };
  const ftvVerdict = (key: string): 'pass' | 'dem' | 'rep' | null => {
    const disprop = evaluation.disproportionality?.[key];
    if (disprop === undefined || ftvThreshold === null) return null;
    if (Math.abs(disprop) <= ftvThreshold + FLOAT_TOLERANCE) return 'pass';
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
    s => Math.abs(s - 0.5) <= competitiveBandFraction + FLOAT_TOLERANCE
  ).length;

  // Shared by the two tables it governs; hidden when the plan has no test elections.
  const electionSelector = ftv !== null && (
    <Flex align="center" gap="1">
      <Text size="1" color="gray">
        Show
      </Text>
      <Select.Root
        size="1"
        value={electionShowMode}
        onValueChange={v => setElectionShowMode(v as ElectionShowMode)}
      >
        <Select.Trigger />
        <Select.Content>
          {EVAL_OPTION_VALUES.electionShowMode.map(mode => (
            <Select.Item key={mode} value={mode}>
              {ELECTION_SHOW_MODE_LABEL[mode]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
  const onlyFtvCaption = onlyFtvElections ? ', Freedom-To-Vote Test elections only' : '';
  // Defines the abbreviation the election selector uses; the report has no selector.
  const ftvAbbreviation = isReport ? '' : ' (FTV)';
  // The third cell of a district row in the competitiveness table: the one trigger
  // that highlights the row's districts on the map, where the row's name labels the
  // highlight. The report has no such column.
  const highlightCell = (districts: number[], rowName: string) =>
    !isReport && (
      <Table.Cell>
        {districts.length > 0 && (
          <Text size="2" wrap="nowrap">
            <HoverTrigger
              chip
              onEnter={() => onDistrictEnter(districts, rowName)}
              onLeave={onDistrictLeave}
            >
              {districts.length === 1 ? 'Highlight this district' : 'Highlight these districts'}
            </HoverTrigger>
          </Text>
        )}
      </Table.Cell>
    );

  return (
    <EvalSection value="partisan" title="Election Results and Partisanship">
      {n > 0 && (
        <Text size="2" mb="3" as="p">
          Our current dataset contains{' '}
          {isReport ? (
            <strong>
              {n} recent statewide election{n !== 1 ? 's' : ''}
            </strong>
          ) : (
            <HoverCard.Root openDelay={ELECTION_LIST_OPEN_DELAY_MS} closeDelay={0}>
              <HoverCard.Trigger>
                <button type="button" style={{...HOVER_BTN_STYLE, fontWeight: 'bold'}}>
                  {n} recent statewide election{n !== 1 ? 's' : ''}
                </button>
              </HoverCard.Trigger>
              <HoverCard.Content size="1">
                <ul className="m-0 list-none p-0">
                  {elections.map(key => (
                    <Text key={key} size="2" asChild>
                      <li>{formatElectionKey(key)}</li>
                    </Text>
                  ))}
                </ul>
              </HoverCard.Content>
            </HoverCard.Root>
          )}
          <ReportNoteRef {...DATA_SOURCE_NOTES.electionResults} />.{' '}
        </Text>
      )}

      {/* Freedom-To-Vote Test */}
      {n > 0 && (
        <>
          <EvalSubheading>Freedom-To-Vote Test</EvalSubheading>
          {ftvPassCount === null && (
            <Text size="2" mb="3" as="p">
              Not enough recent Presidential and Senate election data is available to score this
              plan against the <FtvTestName />
              {ftvAbbreviation}.
            </Text>
          )}
          {ftvPassCount !== null && (
            <>
              <Text size="2" mb="2" as="p">
                This plan <strong>{ftvOverallPass ? 'passes' : 'does not pass'}</strong> the{' '}
                <FtvTestName />
                {ftvAbbreviation} for partisan balance. To see why, we use the last two Senate races
                and the last two Presidential races as our test contests (
                {joinWithAnd(ftvElections.map(formatElectionKey))}). We check if the seat share
                would have been proportional to the vote share in those contests, up to an allowed
                bound of <strong>{ftvBoundPhrase}</strong>.
              </Text>
              <EvalTableTitle reportOnly>
                Freedom-To-Vote Test by contest, {povName} point of view
              </EvalTableTitle>
              <Flex mb="2" display={isReport ? 'none' : 'flex'}>
                <PovSwitcher pov={pov} setPov={setPov} />
              </Flex>
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
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold">
                          {pov === 'dem' ? 'D' : 'R'} vote share
                        </Text>
                      </Table.Cell>
                      {ftvElections.map(key => (
                        <Table.Cell key={key} justify="center">
                          <Text size="2">
                            {povVoteShare(key) !== null
                              ? `${(povVoteShare(key)! * 100).toFixed(1)}%`
                              : '—'}
                          </Text>
                        </Table.Cell>
                      ))}
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold">
                          {pov === 'dem' ? 'D' : 'R'} seat share
                        </Text>
                      </Table.Cell>
                      {ftvElections.map(key => (
                        <Table.Cell key={key} justify="center">
                          <Text size="2">
                            {povSeatShare(key) !== null
                              ? `${(povSeatShare(key)! * 100).toFixed(1)}%`
                              : '—'}
                          </Text>
                        </Table.Cell>
                      ))}
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold">
                          Diff
                        </Text>
                      </Table.Cell>
                      {ftvElections.map(key => {
                        const disprop = evaluation.disproportionality?.[key];
                        return (
                          <Table.Cell
                            key={key}
                            justify="center"
                            style={{
                              backgroundColor: scaledBg(disprop, METRIC_CUTOFF.disp),
                              color: scaledTextColor(disprop, METRIC_CUTOFF.disp),
                            }}
                          >
                            <Text size="2" wrap="nowrap">
                              {disprop !== undefined ? formatFtvDiff(disprop) : '—'}
                            </Text>
                          </Table.Cell>
                        );
                      })}
                    </Table.Row>
                    <Table.Row>
                      <Table.Cell justify="center">
                        <Text size="2" weight="bold">
                          Close enough ({formatThreshold(ftvThreshold!)} Threshold)
                        </Text>
                      </Table.Cell>
                      {ftvElections.map(key => {
                        const verdict = ftvVerdict(key);
                        return (
                          <Table.Cell key={key} justify="center">
                            <Text size="2" wrap="nowrap">
                              {verdict === null ? (
                                '—'
                              ) : verdict === 'pass' ? (
                                <CheckIcon
                                  aria-label="Close enough"
                                  style={{...VERDICT_ICON_STYLE, color: 'var(--green-9)'}}
                                />
                              ) : (
                                <>
                                  <Cross2Icon
                                    aria-label="Not close enough"
                                    style={VERDICT_ICON_STYLE}
                                  />{' '}
                                  (
                                  <span style={{color: verdict === 'dem' ? DEM : REP}}>
                                    {verdict === 'dem' ? 'D' : 'R'} tilt
                                  </span>
                                  )
                                </>
                              )}
                            </Text>
                          </Table.Cell>
                        );
                      })}
                    </Table.Row>
                  </Table.Body>
                </Table.Root>
              </div>
              <Text size="2" mb="3" as="p">
                This is close enough <strong>{ftvPassCount} out of 4 times</strong>, so it{' '}
                {ftvOverallPass ? 'passes' : 'does not pass'} the test. (3 out of 4 are needed to
                pass.)
              </Text>
            </>
          )}
        </>
      )}

      {/* Proportionality */}
      {n > 0 && (
        <>
          <EvalSubheading>Proportionality</EvalSubheading>
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
            over the {n} recent statewide election{n !== 1 ? 's' : ''}.
          </Text>
          <EvalTableTitle>
            Votes vs. Seats by Election (among the two major parties)
            {isReport && `, ${povName} point of view${onlyFtvCaption}`}
          </EvalTableTitle>
          <Flex
            mb="2"
            gap="4"
            align="center"
            justify="between"
            wrap="wrap"
            display={isReport ? 'none' : 'flex'}
          >
            <PovSwitcher pov={pov} setPov={setPov} />
            {electionSelector}
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
                  <Table.ColumnHeaderCell justify="center" style={{color: povColor, width: '8ch'}}>
                    {pov === 'dem' ? 'D' : 'R'} Vote
                    <br />
                    Share
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="center" style={{color: povColor, width: '8ch'}}>
                    {pov === 'dem' ? 'D>R' : 'R>D'}
                    <br />
                    Districts
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="center" style={{color: povColor, width: '8ch'}}>
                    {pov === 'dem' ? 'D' : 'R'} Seat
                    <br />
                    Share
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="center" style={{minWidth: '22ch'}}>
                    Disproportionality
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {tableElections.map(key => {
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
                        <Text size="2">{votes != null ? votes.total.toLocaleString() : '—'}</Text>
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

      {/* Other Partisanship Metrics */}
      {n > 0 && (
        <>
          <EvalSubheading>Other Partisanship Metrics</EvalSubheading>
          <EvalTableTitle reportOnly>
            Partisanship metrics by election, {povName} point of view
            {onlyFtvCaption}
          </EvalTableTitle>
          <Flex
            mb="2"
            gap="4"
            align="center"
            justify="between"
            wrap="wrap"
            display={isReport ? 'none' : 'flex'}
          >
            <PovSwitcher pov={pov} setPov={setPov} />
            {electionSelector}
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
                {tableElections.map(key => (
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
                        {formatNumber(povSign(evaluation.eguia?.[key]), NUMBER_FORMATS.SIGNED_PCT)}
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
          <EvalSubheading>Competitiveness</EvalSubheading>
          <Text size="2" mb="3" as="p">
            A district is considered <strong>competitive</strong> in a particular vote pattern if
            it&apos;s close to 50-50 within the major parties{' '}
            {isReport ? (
              <>
                — more specifically, if its vote shares deviate from even by an amount within{' '}
                <strong>±{competitiveBand} points</strong>
              </>
            ) : (
              '(you may select the threshold for closeness below)'
            )}
            . We call a district a <strong>swing</strong> district if each major party won it at
            least once over the elections in our dataset. If it was always won by the same party
            across those contests, we label it as <strong>D Sweep</strong> or{' '}
            <strong>R Sweep</strong>.
          </Text>
          <EvalTableTitle reportOnly>
            Competitive contests (within ±{competitiveBand} points), swing districts and sweep
            districts
          </EvalTableTitle>
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
                  {!isReport && <Table.Cell />}
                </Table.Row>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">Competitive contests</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold" wrap="nowrap">
                      {nCompetitiveContests} / {contestDemVoteShares.length}
                    </Text>
                  </Table.Cell>
                  {!isReport && (
                    <Table.Cell>
                      <Flex align="center" gap="1">
                        <Text size="1" color="gray">
                          Threshold
                        </Text>
                        <Select.Root
                          value={competitiveBand}
                          onValueChange={v =>
                            setCompetitiveBand(v as EvalOptions['competitiveBand'])
                          }
                          size="1"
                        >
                          <Select.Trigger aria-label="Threshold" />
                          <Select.Content>
                            {EVAL_OPTION_VALUES.competitiveBand.map(band => (
                              <Select.Item key={band} value={band}>
                                ±{band} points
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                      </Flex>
                    </Table.Cell>
                  )}
                </Table.Row>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">Swing districts</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold" wrap="nowrap">
                      {swingDistricts.length} / {nDistrictsTotal}
                    </Text>
                  </Table.Cell>
                  {highlightCell(swingDistricts, 'Swing districts')}
                </Table.Row>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">D Sweep districts</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold" wrap="nowrap">
                      {demSweepDistricts.length} / {nDistrictsTotal}
                    </Text>
                  </Table.Cell>
                  {highlightCell(demSweepDistricts, 'D Sweep districts')}
                </Table.Row>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">R Sweep districts</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold" wrap="nowrap">
                      {repSweepDistricts.length} / {nDistrictsTotal}
                    </Text>
                  </Table.Cell>
                  {highlightCell(repSweepDistricts, 'R Sweep districts')}
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </div>
        </>
      )}
    </EvalSection>
  );
};
