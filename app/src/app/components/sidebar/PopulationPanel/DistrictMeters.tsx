'use client';
import React, {useState} from 'react';
import {Box, Button, Flex, IconButton, Text, Tooltip} from '@radix-ui/themes';
import {EyeNoneIcon, EyeOpenIcon, LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {ZoneDescriptionPopover} from './ZoneDescriptionPopover';
import {ConditionalScrollArea} from '../ConditionalScrollArea';
import {ShowAllDistrictsButton} from '../ShowAllDistrictsButton';
import {formatNumber} from '@utils/numbers';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';
import {useUiHintStore} from '@store/uiHintStore';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ACCESS_STATES} from '@constants/document/state';

const POP_COL_WIDTH = 112;
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
// Row rhythm: two lines of text (24px + 16px) plus 4px padding either side.
const ROW_HEIGHT = 48;
// The per-row ideal-line segment overhangs the bar by this much on each side
// so the segments join into one continuous line across stacked rows.
const TICK_OVERHANG = (ROW_HEIGHT - BAR_HEIGHT) / 2;
// A playful spring so bars visibly *land* when population changes.
const BAR_SPRING = 'width 350ms cubic-bezier(0.34, 1.56, 0.64, 1)';
// Arrow tip depth for bars pinned at the end of the track.
const ARROW_DEPTH = BAR_HEIGHT / 2;

// Scoreboard-style stat labels: small caps, wide tracking.
const STAT_LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 11,
};

// Unicode minus to match the tabular figures.
const signedNumber = (value: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value), NUMBER_FORMATS.STRING)}`;
const signedPercent = (value: number, ideal: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value / ideal), NUMBER_FORMATS.PERCENT)}`;

/**
 * District overview as a set of population meters: each district's colored bar
 * fills toward a shared ideal line; population past ideal renders in a darker
 * shade of the district color. Rows lead with their district number and show
 * population plus signed deviation. Bars pinned at the track's end (125% of
 * ideal and beyond) turn their row text red and sharpen into an arrow. A
 * plan-wide scoreboard (unassigned, top-to-bottom deviation, max deviation)
 * sits at the bottom.
 */
export const DistrictMeters = () => {
  const {populationData} = useZonePopulations();
  const {summaryStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const higlightUnassigned = useMapControlsStore(
    state => state.mapOptions.higlightUnassigned ?? false
  );
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const requestSidebarTab = useUiHintStore(state => state.requestSidebarTab);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const superDraw = useToolbarStore(state => state.superDraw);
  const access = useMapStore(state => state.mapStatus?.access);
  const getZoneColor = useZoneColorGetter();
  const selectCommunity = useSelectCommunity();

  // Both Draw and Super Draw default to started-districts-only (small plans
  // default to all); null = no explicit choice yet.
  const [showAllOverride, setShowAllOverride] = useState<boolean | null>(null);
  const showAll = showAllOverride ?? populationData.length < SHOW_ALL_DEFAULT_MAX;
  const startedData = populationData.filter(d => (d.total_pop_20 ?? 0) > 0);
  const visibleData = showAll ? populationData : startedData;
  const hiddenCount = populationData.length - startedData.length;

  const isReadOnly = access === ACCESS_STATES.READ;
  const populations = populationData.map(d => d.total_pop_20 ?? 0);
  // Largest minus smallest district population, unstarted districts included.
  const topToBottom =
    populations.length > 0 ? Math.max(...populations) - Math.min(...populations) : undefined;
  // The single worst signed deviation from ideal across districts.
  const maxDeviation = idealPopulation
    ? populations.reduce(
        (worst, pop) =>
          Math.abs(pop - idealPopulation) > Math.abs(worst) ? pop - idealPopulation : worst,
        0
      )
    : undefined;
  const unassigned = summaryStats?.unassigned;
  const allAssigned = unassigned === 0;

  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...lockPaintedAreas, zone]);
    }
  };

  const handleFindUnassigned = () => {
    requestSidebarTab('stats');
  };

  // Fixed number column sized to the widest district number so every bar
  // starts at the same x.
  const numColWidth = `${String(populationData.length).length + 1}ch`;

  return (
    <Flex direction="column" gap="0" mt="2" style={{maxWidth: MAX_METERS_WIDTH, width: '100%'}}>
      {/* The ideal population, labeled where its line crosses the bars. */}
      {!!idealPopulation && (
        <Flex gap="2" px="1" pb="1">
          {/* Mirrors the rows' leading number column so the label's x-scale
              matches the bars' tick. */}
          <Box style={{width: numColWidth, flexShrink: 0}} />
          <Box flexGrow="1" style={{position: 'relative', height: 18}}>
            <Text
              size="1"
              color="gray"
              style={{
                position: 'absolute',
                left: `${IDEAL_TICK * 100}%`,
                bottom: 0,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              Ideal {formatNumber(idealPopulation, NUMBER_FORMATS.STRING)}
            </Text>
          </Box>
          <Box style={{width: POP_COL_WIDTH, flexShrink: 0}} />
        </Flex>
      )}
      <ConditionalScrollArea
        shouldUseScrollableRows={visibleData.length > ROW_SCROLL_THRESHOLD}
        maxHeight="60vh"
      >
        <Flex direction="column" gap="0">
          {visibleData.map(d => {
            const population = d.total_pop_20 ?? 0;
            const fill = idealPopulation ? population / idealPopulation : 0;
            // Off the scale: the bar is pinned at the track's end (>=125% of
            // ideal). Only then does the row go red and grow an arrow tip.
            const offScale = !!idealPopulation && fill >= 1 / IDEAL_TICK;
            const color = getZoneColor(d.zone);
            // Population past ideal renders as a darker shade of the
            // district's own color.
            const overflowColor = `color-mix(in srgb, ${color} 70%, black)`;
            const locked = lockPaintedAreas.includes(d.zone);
            const deviation = idealPopulation ? population - idealPopulation : undefined;
            return (
              <Flex
                key={d.zone}
                align="center"
                gap="2"
                px="1"
                onClick={() => selectCommunity(d.zone)}
                className={`cursor-pointer rounded-md transition-colors duration-150 ${
                  selectedZone === d.zone ? 'bg-[var(--accent-3)]' : 'hover:bg-[var(--gray-2)]'
                }`}
                style={{height: ROW_HEIGHT}}
                data-testid={`district-meter-row-${d.zone}`}
              >
                <Text
                  size="2"
                  color={offScale ? 'red' : 'gray'}
                  weight={selectedZone === d.zone ? 'bold' : 'regular'}
                  style={{
                    width: numColWidth,
                    flexShrink: 0,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d.zone}
                </Text>
                {/* Comment and per-district lock are Super Draw features; plain
                    Draw rows are just the number, bar, and totals. Icons manage
                    their own interactions; don't let clicks re-select the row. */}
                {superDraw && isEditing && (
                  <Flex align="center" gap="1" flexShrink="0" onClick={e => e.stopPropagation()}>
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
                <Box flexGrow="1" style={{height: BAR_HEIGHT, position: 'relative'}}>
                  {/* Track clips the fills; the tick renders outside it so it
                      can overhang the bar's height. */}
                  <Box
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 99,
                      background: 'var(--gray-a4)',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      style={{
                        width: `${Math.min(1, fill) * IDEAL_TICK * 100}%`,
                        height: '100%',
                        background: color,
                        transition: BAR_SPRING,
                      }}
                    />
                    {/* Population past ideal crosses the tick in a darker shade
                        of the district color; pinned at the track's end it
                        sharpens into an arrow — beyond the scale. */}
                    {fill > 1 && (
                      <Box
                        style={{
                          position: 'absolute',
                          left: `${IDEAL_TICK * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: `${(Math.min(fill, 1 / IDEAL_TICK) - 1) * IDEAL_TICK * 100}%`,
                          background: overflowColor,
                          transition: BAR_SPRING,
                          ...(offScale
                            ? {
                                clipPath: `polygon(0 0, calc(100% - ${ARROW_DEPTH}px) 0, 100% 50%, calc(100% - ${ARROW_DEPTH}px) 100%, 0 100%)`,
                              }
                            : {}),
                        }}
                      />
                    )}
                  </Box>
                  {/* Per-row segment of the shared ideal line; the overhang
                      bridges the gap to the neighboring rows' bars so the line
                      reads as continuous. */}
                  <Box
                    style={{
                      position: 'absolute',
                      left: `${IDEAL_TICK * 100}%`,
                      top: -TICK_OVERHANG,
                      bottom: -TICK_OVERHANG,
                      width: 2,
                      marginLeft: -1,
                      background: 'var(--gray-a6)',
                    }}
                  />
                </Box>
                {/* Population with its signed deviation right below. */}
                <Flex
                  direction="column"
                  align="end"
                  justify="center"
                  style={{width: POP_COL_WIDTH, flexShrink: 0}}
                >
                  <Text
                    size="3"
                    weight="medium"
                    color={offScale ? 'red' : undefined}
                    style={{fontVariantNumeric: 'tabular-nums', lineHeight: '24px'}}
                  >
                    {formatNumber(population, NUMBER_FORMATS.STRING)}
                  </Text>
                  {deviation !== undefined && !!idealPopulation && (
                    <Text
                      size="1"
                      color={offScale ? 'red' : 'gray'}
                      style={{fontVariantNumeric: 'tabular-nums', lineHeight: '16px'}}
                    >
                      {signedNumber(deviation)} ({signedPercent(deviation, idealPopulation)})
                    </Text>
                  )}
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      </ConditionalScrollArea>
      <ShowAllDistrictsButton
        showAll={showAll}
        onToggle={() => setShowAllOverride(!showAll)}
        total={populationData.length}
        hiddenCount={hiddenCount}
      />
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
            <Flex gap="2" mt="1">
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
              <Button
                size="1"
                variant="ghost"
                onClick={handleFindUnassigned}
                style={{fontWeight: 600}}
              >
                Find areas →
              </Button>
            </Flex>
          )}
        </Flex>
        <Flex direction="column">
          <Flex align="center" gap="0">
            <Text color="gray" style={STAT_LABEL_STYLE}>
              Top-to-bottom
            </Text>
            <HelpTip tip="topToBottomDeviation" openDelay={HELP_TIP_FAST_DELAY} />
          </Flex>
          <Flex align="baseline" gap="1">
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
          <Flex align="center" gap="0">
            <Text color="gray" style={STAT_LABEL_STYLE}>
              Max deviation
            </Text>
            <HelpTip tip="maxDeviation" openDelay={HELP_TIP_FAST_DELAY} />
          </Flex>
          <Flex align="baseline" gap="1">
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
