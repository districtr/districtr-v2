'use client';
import React, {useEffect, useState} from 'react';
import {Box, Button, Flex, HoverCard, IconButton, Text, Tooltip} from '@radix-ui/themes';
import {
  ChevronRightIcon,
  EyeNoneIcon,
  EyeOpenIcon,
  LockClosedIcon,
  LockOpen2Icon,
} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {DEFAULT_CHART_OPTIONS, useChartStore} from '@store/chartStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {ZoneDescriptionPopover} from './ZoneDescriptionPopover';
import {
  ZoneDescriptionContent,
  ZONE_DESCRIPTION_CARD_WIDTH,
} from '@/app/components/ZoneDescriptions/ZoneDescriptionContent';
import {ConditionalScrollArea, SCROLL_RESERVED_WIDTH} from '../ConditionalScrollArea';
import {ShowAllDistrictsButton} from '../ShowAllDistrictsButton';
import {PopulationPanelOptions} from './PopulationPanelOptions';
import {formatNumber} from '@utils/numbers';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ACCESS_STATES} from '@constants/document/state';

const POP_COL_WIDTH = 76;
const DEV_COL_WIDTH = 76;
// Mirrors the rows' Super Draw icon cluster so the header strip's x-scale
// matches the bars' when icons are showing: two size-1 icon buttons (24px), the
// cluster gap (4px), and the comment button's trailing space (TWIN_TRAIL).
const ICONS_WIDTH = 56;
// ZoneDescriptionPopover's trigger carries mr-2, but its ghost-variant negative
// margin eats half of it: measured against the rendered rows, its real trailing
// space is 6px, not 8. The header's invisible twin uses the measured value —
// copying the mr-2 class instead puts the lock-all 4px right of the rows'.
const TWIN_TRAIL = 6;

// Bars stop growing on wide sidebars; everything (label strip, rows,
// scoreboard) shares the cap so columns stay aligned.
const MAX_METERS_WIDTH = 560;
const ROW_SCROLL_THRESHOLD = 10;
// Small plans default to showing every district; larger ones start with
// started-only.
const SHOW_ALL_DEFAULT_MAX = 10;
// Ideal population sits at a fixed tick partway along the track, so a bar can
// visibly cross it: the darker excess segment past the tick shows how far over
// a district is (up to 1/IDEAL_TICK = 125% of ideal before clamping).
const IDEAL_TICK = 0.8;
const BAR_HEIGHT = 24;
// Row rhythm: one line of column text beside a 24px bar, plus breathing room.
const ROW_HEIGHT = 40;
// The per-row ideal-line segment overhangs the bar by this much on each side
// so the segments join into one continuous line across stacked rows.
const TICK_OVERHANG = (ROW_HEIGHT - BAR_HEIGHT) / 2;
// A playful spring so bars visibly *land* when population changes.
const BAR_SPRING = 'width 350ms cubic-bezier(0.34, 1.56, 0.64, 1)';
// Off-the-scale bars end flat, with one chevron per 25% over ideal (capped at
// three) marking how far past the track the district runs.
const CHEVRON_STEP = 0.25;
const MAX_CHEVRONS = 3;

// Scoreboard-style stat labels: small caps, wide tracking.
const STAT_LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 11,
};

// A row's numeric cells. Digits sit ~1.5px above their line box's center (the
// descender space below the baseline goes unused), so they read as floating
// high beside the geometrically-centered bar; the nudge optically centers them.
const NUM_CELL_STYLE: React.CSSProperties = {
  flexShrink: 0,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  transform: 'translateY(1.5px)',
};

// Column headers over the number columns; kept terse ("Pop") so they fit the
// column width horizontally.
const COL_LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontSize: 10,
};

// Unicode minus to match the tabular figures.
const signedNumber = (value: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value), NUMBER_FORMATS.STRING)}`;
const signedPercent = (value: number, ideal: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value / ideal), NUMBER_FORMATS.PERCENT)}`;

// Population past ideal darkens toward black as the overage grows: the excess
// segment starts 30% black at the ideal line and is fully black at 100% over.
const overflowColorFor = (color: string, population: number, ideal?: number) => {
  const overRatio = ideal ? Math.min(1, Math.max(0, (population - ideal) / ideal)) : 0;
  return `color-mix(in srgb, ${color} ${Math.round(70 * (1 - overRatio))}%, black)`;
};

// Chevrons stacked at the bar's flat end: one per 25% over ideal, three max.
const chevronCount = (population: number, ideal: number) =>
  Math.min(MAX_CHEVRONS, Math.floor((population - ideal) / ideal / CHEVRON_STEP));

// Deliberate beat so mousing across the meters doesn't flash description cards.
const DESCRIPTION_HOVER_DELAY = 1250;

/** Plain Draw's description surface: hovering a row for a beat opens the same
 * card Super Draw shows in its popover. Inactive renders the row bare. */
const ZoneDescriptionHoverCard: React.FC<{
  zone: number;
  color: string;
  active: boolean;
  showEditingControls: boolean;
  children: React.ReactElement;
}> = ({zone, color, active, showEditingControls, children}) =>
  active ? (
    <HoverCard.Root openDelay={DESCRIPTION_HOVER_DELAY}>
      <HoverCard.Trigger>{children}</HoverCard.Trigger>
      <HoverCard.Content
        style={{width: ZONE_DESCRIPTION_CARD_WIDTH}}
        onClick={e => e.stopPropagation()}
      >
        <ZoneDescriptionContent
          zone={zone}
          color={color}
          showEditingControls={showEditingControls}
        />
      </HoverCard.Content>
    </HoverCard.Root>
  ) : (
    children
  );

/** "Keeps going" marker on an off-the-scale bar's end. */
const OffScaleChevrons: React.FC<{count: number}> = ({count}) => (
  <Flex
    align="center"
    aria-hidden
    style={{position: 'absolute', top: 0, bottom: 0, right: 4, color: 'white'}}
  >
    {Array.from({length: count}, (_, i) => (
      // Overlapped so the chevrons read as one ">>" cluster, not spaced icons.
      <ChevronRightIcon key={i} style={{marginRight: i < count - 1 ? -6 : 0}} />
    ))}
  </Flex>
);

/**
 * District overview as a set of population meters: each district's colored bar
 * fills toward a shared ideal line; population past ideal renders in a darker
 * shade of the district color. Rows lead with their district number and show
 * population and signed deviation in labeled columns. Bars pinned at the
 * track's end (125% of ideal and beyond) turn their row text red and carry a
 * chevron per 25% over ideal. A plan-wide scoreboard (unassigned, top-to-bottom
 * deviation, max deviation) sits at the bottom; the two deviation stats only
 * resolve once every district is started.
 *
 * Honors the population chart settings (chartStore): column visibility and the
 * target-deviation band around the ideal line.
 */
export const DistrictMeters = () => {
  const {populationData} = useZonePopulations();
  const {summaryStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const toggleLockAllAreas = useMapControlsStore(state => state.toggleLockAllAreas);
  const higlightUnassigned = useMapControlsStore(
    state => state.mapOptions.higlightUnassigned ?? false
  );
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const superDraw = useToolbarStore(state => state.superDraw);
  const access = useMapStore(state => state.mapStatus?.access);
  // Plain Draw surfaces descriptions as a row hover card; Super Draw uses the
  // icon popover.
  const documentComments = useMapStore(state => state.mapDocument?.document_comments);
  // comment_length_limit 0/null disables descriptions — gate the card so it
  // can't open empty.
  const descriptionsEnabled = !!useMapStore(state => state.mapDocument?.comment_length_limit);
  const chartOptions = useChartStore(state => state.chartOptions);
  const setChartOptions = useChartStore(state => state.setChartOptions);

  // Plain Draw has no chart-settings UI, so leaving Super Draw resets the
  // options — otherwise hidden columns or a target-deviation band would be
  // stranded with no way to undo them.
  useEffect(() => {
    if (!superDraw) setChartOptions(DEFAULT_CHART_OPTIONS);
  }, [superDraw, setChartOptions]);
  const getZoneColor = useZoneColorGetter();
  const selectCommunity = useSelectCommunity();

  // Both Draw and Super Draw default to started-districts-only (small plans
  // default to all); null = no explicit choice yet.
  const [showAllOverride, setShowAllOverride] = useState<boolean | null>(null);
  const showAll = showAllOverride ?? populationData.length < SHOW_ALL_DEFAULT_MAX;
  const startedData = populationData.filter(d => (d.total_pop_20 ?? 0) > 0);
  // The selected district always gets a row, started or not: picking an empty
  // district to draw into and having no bar appear reads as a broken panel.
  const visibleData = showAll
    ? populationData
    : populationData.filter(d => (d.total_pop_20 ?? 0) > 0 || d.zone === selectedZone);
  const hiddenCount = showAll
    ? populationData.length - startedData.length
    : populationData.length - visibleData.length;
  const nothingStarted = startedData.length === 0;

  // Population chart settings (the settings popover in Super Draw).
  const showDistrictNumbers = chartOptions.popShowDistrictNumbers;
  const showPopNumbers = chartOptions.popShowPopNumbers;
  const showDeviations = chartOptions.popShowTopBottomDeviation;
  const targetDeviation = chartOptions.popTargetPopDeviation;

  const isReadOnly = access === ACCESS_STATES.READ;
  const populations = populationData.map(d => d.total_pop_20 ?? 0);
  // Population represented by the full track: 125% of ideal, so ideal sits at
  // the IDEAL_TICK.
  const scaleTotal = idealPopulation ? idealPopulation / IDEAL_TICK : undefined;
  const tickFraction = idealPopulation && scaleTotal ? idealPopulation / scaleTotal : undefined;

  // Plan-wide deviation stats are meaningless while districts sit at zero
  // population (top-to-bottom would just be the largest district), so they
  // stay unresolved until every district is started.
  const allStarted = populations.length > 0 && populations.every(pop => pop > 0);
  // Largest minus smallest district population.
  const topToBottom = allStarted ? Math.max(...populations) - Math.min(...populations) : undefined;
  // The single worst signed deviation from ideal across districts.
  const maxDeviation =
    allStarted && idealPopulation
      ? populations.reduce(
          (worst, pop) =>
            Math.abs(pop - idealPopulation) > Math.abs(worst) ? pop - idealPopulation : worst,
          0
        )
      : undefined;
  const pendingStatTitle = allStarted ? undefined : 'Available once every district is started';
  const unassigned = summaryStats?.unassigned;
  const allAssigned = unassigned === 0;

  const allLocked =
    populationData.length > 0 && populationData.every(d => lockPaintedAreas.includes(d.zone));
  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...lockPaintedAreas, zone]);
    }
  };

  // Fixed number column sized to the widest district number so every bar
  // starts at the same x.
  const numColWidth = `${String(populationData.length).length + 1}ch`;
  const showRowIcons = superDraw && isEditing;
  const rowsScroll = visibleData.length > ROW_SCROLL_THRESHOLD;

  // The target-deviation band brackets the ideal line; rendered per row (like
  // the tick) so it reads as one continuous band.
  const band =
    targetDeviation && idealPopulation && scaleTotal
      ? {
          left: Math.max(0, (idealPopulation - targetDeviation) / scaleTotal),
          right: Math.min(1, (idealPopulation + targetDeviation) / scaleTotal),
        }
      : undefined;

  return (
    <Flex
      direction="column"
      gap="0"
      mt="2"
      // Centered once the sidebar is wider than the cap, rather than left-hugging
      // with all the slack on one side.
      style={{maxWidth: MAX_METERS_WIDTH, width: '100%', marginInline: 'auto'}}
    >
      {nothingStarted ? (
        <Text color="gray" size="2" my="4" style={{textAlign: 'center'}}>
          Start painting to see population bars
        </Text>
      ) : (
        <>
          {/* Header strip: vertical column labels, and the ideal population
              labeled where its line crosses the bars. It sits outside the
              rows' ScrollArea, so it has to reserve the same right-edge width
              the scrollbar takes or the columns and the ideal line drift out
              from under their labels. */}
          <Flex
            gap="2"
            px="1"
            pb="1"
            align="end"
            style={
              rowsScroll
                ? {paddingRight: `calc(var(--space-1) + ${SCROLL_RESERVED_WIDTH})`}
                : undefined
            }
          >
            {showDistrictNumbers && <Box style={{width: numColWidth, flexShrink: 0}} />}
            {showRowIcons && (
              /* Mirrors the rows' icon cluster exactly — an invisible twin of
                 the comment button, then the lock — so the lock-all lands
                 directly above the rows' lock icons (ghost-margin quirks
                 included). */
              <Flex align="center" gap="1" style={{width: ICONS_WIDTH, flexShrink: 0}}>
                <IconButton
                  variant="ghost"
                  size="1"
                  aria-hidden
                  tabIndex={-1}
                  style={{visibility: 'hidden', marginRight: TWIN_TRAIL}}
                >
                  <LockOpen2Icon />
                </IconButton>
                <HelpTip tip="districtLock" openDelay={HELP_TIP_FAST_DELAY}>
                  <IconButton
                    onClick={toggleLockAllAreas}
                    variant="ghost"
                    size="1"
                    disabled={isReadOnly}
                    aria-label={allLocked ? 'Unlock all districts' : 'Lock all districts'}
                  >
                    {allLocked ? <LockClosedIcon /> : <LockOpen2Icon />}
                  </IconButton>
                </HelpTip>
              </Flex>
            )}
            <Box flexGrow="1" style={{position: 'relative', alignSelf: 'stretch'}}>
              {!!idealPopulation && tickFraction !== undefined && (
                /* The label itself is the help trigger — an extra info icon
                   would crowd the header strip. */
                <HelpTip tip="idealPopulation" openDelay={HELP_TIP_FAST_DELAY}>
                  <Text
                    size="1"
                    color="gray"
                    className="cursor-help"
                    style={{
                      position: 'absolute',
                      left: `${tickFraction * 100}%`,
                      bottom: 0,
                      transform: 'translateX(-50%)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ideal {formatNumber(idealPopulation, NUMBER_FORMATS.STRING)}
                  </Text>
                </HelpTip>
              )}
            </Box>
            {showPopNumbers && (
              <Text
                color="gray"
                style={{
                  ...COL_LABEL_STYLE,
                  width: POP_COL_WIDTH,
                  flexShrink: 0,
                  textAlign: 'right',
                }}
              >
                Pop
              </Text>
            )}
            {showDeviations && (
              <Text
                color="gray"
                style={{
                  ...COL_LABEL_STYLE,
                  width: DEV_COL_WIDTH,
                  flexShrink: 0,
                  textAlign: 'right',
                }}
              >
                Deviation
              </Text>
            )}
          </Flex>
          <ConditionalScrollArea shouldUseScrollableRows={rowsScroll} maxHeight="60vh">
            <Flex direction="column" gap="0">
              {visibleData.map(d => {
                const population = d.total_pop_20 ?? 0;
                const fill = scaleTotal ? population / scaleTotal : 0;
                // Off the scale: 125% of ideal and beyond. The row goes red and
                // the bar, pinned at the track's end, breaks off in a squiggle.
                const offScale = !!idealPopulation && population >= idealPopulation / IDEAL_TICK;
                const chevrons = idealPopulation ? chevronCount(population, idealPopulation) : 0;
                const color = getZoneColor(d.zone);
                const overflowColor = overflowColorFor(color, population, idealPopulation);
                const locked = lockPaintedAreas.includes(d.zone);
                const deviation = idealPopulation ? population - idealPopulation : undefined;
                const overflowsIdeal =
                  tickFraction !== undefined && !!idealPopulation && population > idealPopulation;
                const hasDescription = documentComments?.some(c => c.zone === d.zone) ?? false;
                return (
                  <ZoneDescriptionHoverCard
                    key={d.zone}
                    zone={d.zone}
                    color={color}
                    active={descriptionsEnabled && !superDraw && (hasDescription || isEditing)}
                    showEditingControls={isEditing}
                  >
                    <Flex
                      align="center"
                      gap="2"
                      px="1"
                      // Clicking anywhere on the row selects it, but the row
                      // itself stays a plain div: a role="button" wrapping the
                      // lock/comment controls is invalid ARIA and hides them
                      // from assistive tech. The bar carries the real <button>.
                      onClick={() => selectCommunity(d.zone)}
                      // `group`: ZoneDescriptionPopover's bubble fades in on row hover
                      className={`group cursor-pointer rounded-md transition-colors duration-150 ${
                        selectedZone === d.zone
                          ? 'bg-[var(--accent-3)]'
                          : 'hover:bg-[var(--gray-2)]'
                      }`}
                      style={{height: ROW_HEIGHT}}
                      data-testid={`district-meter-row-${d.zone}`}
                    >
                      {showDistrictNumbers && (
                        <Text
                          size="2"
                          color={offScale ? 'red' : 'gray'}
                          weight={selectedZone === d.zone ? 'bold' : 'regular'}
                          style={{...NUM_CELL_STYLE, width: numColWidth}}
                        >
                          {d.zone}
                        </Text>
                      )}
                      {/* Comment and per-district lock are Super Draw features.
                        Icons manage their own interactions; don't let clicks
                        re-select the row. */}
                      {showRowIcons && (
                        <Flex
                          align="center"
                          gap="1"
                          flexShrink="0"
                          style={{width: ICONS_WIDTH}}
                          onClick={e => e.stopPropagation()}
                        >
                          <ZoneDescriptionPopover zone={d.zone} color={color} />
                          <Tooltip
                            content={
                              locked
                                ? 'Unlock this district to allow painting over it'
                                : "Lock this district so it can't be painted over"
                            }
                          >
                            <IconButton
                              onClick={() => handleLockChange(d.zone)}
                              variant="ghost"
                              size="1"
                              disabled={isReadOnly}
                              aria-label={
                                locked ? `Unlock district ${d.zone}` : `Lock district ${d.zone}`
                              }
                            >
                              {locked ? <LockClosedIcon /> : <LockOpen2Icon />}
                            </IconButton>
                          </Tooltip>
                        </Flex>
                      )}
                      {/* The bar is the row's keyboard/AT control — a real
                        <button>, unlike the row, which has to wrap the
                        lock/comment buttons. Its clicks (including the one
                        Enter/Space synthesizes) bubble to the row's handler,
                        so it needs no onClick of its own. */}
                      <button
                        type="button"
                        aria-label={`Select district ${d.zone}`}
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-8)]"
                        style={{
                          flexGrow: 1,
                          height: BAR_HEIGHT,
                          position: 'relative',
                          padding: 0,
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          outlineOffset: 2,
                        }}
                      >
                        {offScale && tickFraction !== undefined ? (
                          /* Off the scale: the bar runs to the track's end and
                           stops flat. Rounded cap on the left, darker shaft
                           past the ideal line, and chevrons on the end: this
                           district is off the chart. */
                          <>
                            <Box
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: `${tickFraction * 100}%`,
                                background: color,
                                borderRadius: '99px 0 0 99px',
                              }}
                            />
                            <Box
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: `${tickFraction * 100}%`,
                                right: 0,
                                background: overflowColor,
                              }}
                            />
                            <OffScaleChevrons count={chevrons} />
                          </>
                        ) : (
                          <>
                            {/* The track runs from the bar's start to the ideal
                              line: rounded cap on the left, squared off exactly
                              at ideal. */}
                            <Box
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: `${(tickFraction ?? 1) * 100}%`,
                                borderRadius: '99px 0 0 99px',
                                background: 'var(--gray-a4)',
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                style={{
                                  width: `${Math.min(fill / (tickFraction ?? 1), 1) * 100}%`,
                                  height: '100%',
                                  background: color,
                                  transition: BAR_SPRING,
                                }}
                              />
                            </Box>
                            {/* Population past ideal extends beyond the track's
                              square end in a darker shade of the district
                              color. */}
                            {overflowsIdeal && tickFraction !== undefined && (
                              <Box
                                style={{
                                  position: 'absolute',
                                  left: `${tickFraction * 100}%`,
                                  top: 0,
                                  bottom: 0,
                                  width: `${(Math.min(fill, 1) - tickFraction) * 100}%`,
                                  background: overflowColor,
                                  transition: BAR_SPRING,
                                }}
                              />
                            )}
                          </>
                        )}
                        {/* Target-deviation band bracketing the ideal line. */}
                        {band && (
                          <Box
                            style={{
                              position: 'absolute',
                              left: `${band.left * 100}%`,
                              width: `${(band.right - band.left) * 100}%`,
                              top: -TICK_OVERHANG,
                              bottom: -TICK_OVERHANG,
                              background: 'var(--gray-a3)',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        {/* Per-row segment of the shared ideal line; the overhang
                          bridges the gap to the neighboring rows' bars so the
                          line reads as continuous. */}
                        {tickFraction !== undefined && (
                          <Box
                            style={{
                              position: 'absolute',
                              left: `${tickFraction * 100}%`,
                              top: -TICK_OVERHANG,
                              bottom: -TICK_OVERHANG,
                              width: 2,
                              marginLeft: -1,
                              background: 'var(--gray-a6)',
                            }}
                          />
                        )}
                      </button>
                      {showPopNumbers && (
                        <Text
                          size="2"
                          weight="medium"
                          color={offScale ? 'red' : undefined}
                          style={{...NUM_CELL_STYLE, width: POP_COL_WIDTH}}
                        >
                          {formatNumber(population, NUMBER_FORMATS.STRING)}
                        </Text>
                      )}
                      {showDeviations && (
                        <Text
                          size="2"
                          color={offScale ? 'red' : 'gray'}
                          style={{...NUM_CELL_STYLE, width: DEV_COL_WIDTH}}
                        >
                          {/* An unstarted district's "deviation" is just the
                            ideal restated as a negative; leave it blank. */}
                          {population > 0 && deviation !== undefined
                            ? signedNumber(deviation)
                            : '—'}
                        </Text>
                      )}
                    </Flex>
                  </ZoneDescriptionHoverCard>
                );
              })}
            </Flex>
          </ConditionalScrollArea>
          <Flex align="center" justify="between" mt="1">
            <ShowAllDistrictsButton
              showAll={showAll}
              onToggle={() => setShowAllOverride(!showAll)}
              total={populationData.length}
              hiddenCount={hiddenCount}
            />
            {superDraw && (
              <span style={{marginLeft: 'auto'}}>
                <PopulationPanelOptions
                  chartOptions={chartOptions}
                  setChartOptions={setChartOptions}
                  idealPopulation={idealPopulation}
                />
              </span>
            )}
          </Flex>
        </>
      )}
      {/* Plan-wide scoreboard: always visible, even with unstarted districts. */}
      <Flex
        gap="4"
        px="1"
        pt="3"
        mt="2"
        justify="between"
        wrap="wrap"
        style={{borderTop: '1px solid var(--gray-4)'}}
      >
        <Flex direction="column">
          <Text color="gray" style={STAT_LABEL_STYLE}>
            Unassigned
          </Text>
          <Text size="4" weight="bold" style={{fontVariantNumeric: 'tabular-nums'}}>
            {unassigned !== undefined ? formatNumber(unassigned, NUMBER_FORMATS.STRING) : '—'}
          </Text>
          {!allAssigned && isEditing && (
            <Flex gap="3" mt="1" align="center">
              {/* Same toggle-button treatment as Lock painted. */}
              <Button
                size="1"
                variant={higlightUnassigned ? 'solid' : 'surface'}
                color="gray"
                highContrast={higlightUnassigned}
                onClick={() => setMapOptions({higlightUnassigned: !higlightUnassigned})}
                aria-pressed={higlightUnassigned}
              >
                {higlightUnassigned ? <EyeOpenIcon /> : <EyeNoneIcon />}
                Show on map
              </Button>
            </Flex>
          )}
        </Flex>
        <Flex direction="column">
          <Flex align="center" gap="1">
            <Text color="gray" style={STAT_LABEL_STYLE}>
              Top-to-bottom
            </Text>
            {/* Counters the trigger icon's built-in baseline nudge (made for
                body text) so it centers on the small-caps label line. */}
            <Flex align="center" style={{transform: 'translateY(-1.5px)'}}>
              <HelpTip tip="topToBottomDeviation" openDelay={HELP_TIP_FAST_DELAY} />
            </Flex>
          </Flex>
          <Flex align="baseline" gap="1" title={pendingStatTitle}>
            <Text size="4" weight="bold" style={{fontVariantNumeric: 'tabular-nums'}}>
              {topToBottom !== undefined ? formatNumber(topToBottom, NUMBER_FORMATS.STRING) : '—'}
            </Text>
            {topToBottom !== undefined && !!idealPopulation && (
              <Text size="1" color="gray" style={{fontVariantNumeric: 'tabular-nums'}}>
                {formatNumber(topToBottom / idealPopulation, NUMBER_FORMATS.PERCENT)}
              </Text>
            )}
          </Flex>
        </Flex>
        <Flex direction="column" align="end">
          <Flex align="center" gap="1">
            <Text color="gray" style={STAT_LABEL_STYLE}>
              Max deviation
            </Text>
            <Flex align="center" style={{transform: 'translateY(-1.5px)'}}>
              <HelpTip tip="maxDeviation" openDelay={HELP_TIP_FAST_DELAY} />
            </Flex>
          </Flex>
          <Flex align="baseline" gap="1" title={pendingStatTitle}>
            <Text size="4" weight="bold" style={{fontVariantNumeric: 'tabular-nums'}}>
              {maxDeviation !== undefined ? signedNumber(maxDeviation) : '—'}
            </Text>
            {maxDeviation !== undefined && !!idealPopulation && (
              <Text size="1" color="gray" style={{fontVariantNumeric: 'tabular-nums'}}>
                {signedPercent(maxDeviation, idealPopulation)}
              </Text>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};
