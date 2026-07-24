'use client';
import React, {useState} from 'react';
import {Box, Flex, IconButton, Text, Tooltip} from '@radix-ui/themes';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {ZoneDescriptionPopover} from './ZoneDescriptionPopover';
import {ConditionalScrollArea} from '../ConditionalScrollArea';
import {ShowAllDistrictsButton} from '../ShowAllDistrictsButton';
import {formatDeviationPct, formatNumber} from '@utils/numbers';
import InfoTip from '@components/InfoTip';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ACCESS_STATES} from '@constants/document/state';

// Rows show just the number; "District" lives in the column header.
const LABEL_COL_WIDTH = 52;
// DEV_COL_WIDTH only aligns the footer aggregates now; the per-row deviation
// column moved into a hover tooltip on the bar.
const DEV_COL_WIDTH = 84;
const POP_COL_WIDTH = 84;
// A district reads as overfull once it passes ideal population by 5%.
const OVERFULL_RATIO = 1.05;
const ROW_SCROLL_THRESHOLD = 10;
// Ideal population sits at a fixed tick partway along the track, so a bar can
// visibly cross it: the red excess segment past the tick shows how far over a
// district is (up to 1/IDEAL_TICK = 125% of ideal before clamping).
const IDEAL_TICK = 0.8;

// Districts within this share of ideal are "close enough" — no end-of-bar
// hint. Matches the Getting started balance step's fine tolerance.
const HINT_TOLERANCE = 0.01;

// Unicode minus to match the tabular figures.
const signedNumber = (value: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value), NUMBER_FORMATS.STRING)}`;
const signedCompact = (value: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value), NUMBER_FORMATS.COMPACT)}`;

/**
 * District overview as a set of population meters: each district fills toward
 * a shared, labeled "ideal" line, turning red past it. A compact ±hint at the
 * end of off-target bars shows how far to go; exact deviation lives in the
 * bar's hover tooltip. One numeric column (total population) sits right of
 * the meters with plan-wide aggregates at the bottom.
 */
export const DistrictMeters = () => {
  const {populationData} = useZonePopulations();
  const {summaryStats, zoneStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const toggleLockAllAreas = useMapControlsStore(state => state.toggleLockAllAreas);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const access = useMapStore(state => state.mapStatus?.access);
  const getZoneColor = useZoneColorGetter();
  const selectCommunity = useSelectCommunity();

  // Unstarted districts stay hidden by default so the overview matches what's
  // actually on the map.
  const [showAll, setShowAll] = useState(false);
  const startedData = populationData.filter(d => (d.total_pop_20 ?? 0) > 0);
  const visibleData = showAll ? populationData : startedData;
  const hiddenCount = populationData.length - startedData.length;

  const isReadOnly = access === ACCESS_STATES.READ;
  const allAreLocked =
    populationData.length > 0 && populationData.every(d => lockPaintedAreas.includes(d.zone));
  const allPainted =
    populationData.length > 0 && populationData.every(d => (d.total_pop_20 ?? 0) > 0);
  // The single worst signed deviation from ideal across districts.
  const maxDeviation =
    allPainted && idealPopulation
      ? populationData.reduce((worst, d) => {
          const deviation = (d.total_pop_20 ?? 0) - idealPopulation;
          return Math.abs(deviation) > Math.abs(worst) ? deviation : worst;
        }, 0)
      : undefined;
  const topToBottomPct =
    allPainted && zoneStats?.range !== undefined && zoneStats?.maxPopulation
      ? zoneStats.range / zoneStats.maxPopulation
      : undefined;
  const unassigned = summaryStats?.unassigned;

  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...lockPaintedAreas, zone]);
    }
  };

  return (
    <Flex direction="column" gap="0" mt="2">
      {/* Ideal population sits with the table it contextualizes ("Vs. ideal"). */}
      {!!idealPopulation && (
        <Flex align="center" justify="end" px="1" pb="1">
          <Text size="1" color="gray">
            Ideal population: <b>{formatNumber(idealPopulation, NUMBER_FORMATS.STRING)}</b>
          </Text>
          <InfoTip tips="idealPopulation" />
        </Flex>
      )}
      {unassigned !== undefined && unassigned > 0 && (
        <Flex align="center" justify="end" px="1" pb="1">
          <Text size="1" color="gray">
            Unassigned population: <b>{formatNumber(unassigned, NUMBER_FORMATS.STRING)}</b>
          </Text>
        </Flex>
      )}
      {/* Column header: lock-all sits in the same column as the row locks. */}
      <Flex align="center" gap="1" px="1" pb="1">
        <Text size="1" color="gray" style={{width: LABEL_COL_WIDTH, flexShrink: 0}}>
          District
        </Text>
        {isEditing && (
          <Tooltip content="Lock or unlock all districts. Locked districts can't be painted over.">
            <IconButton
              onClick={toggleLockAllAreas}
              variant="ghost"
              size="1"
              disabled={isReadOnly}
              aria-label={allAreLocked ? 'Unlock all districts' : 'Lock all districts'}
            >
              {allAreLocked ? <LockClosedIcon /> : <LockOpen2Icon />}
            </IconButton>
          </Tooltip>
        )}
        {/* This spacer occupies the same flex slot as the row bars, so a label
            at IDEAL_TICK% here sits exactly atop the shared ideal line. */}
        <Box flexGrow="1" style={{position: 'relative', alignSelf: 'stretch'}}>
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
            ideal
          </Text>
        </Box>
        <Text
          size="1"
          color="gray"
          style={{width: POP_COL_WIDTH, textAlign: 'right', flexShrink: 0}}
        >
          Population
        </Text>
      </Flex>
      <ConditionalScrollArea
        shouldUseScrollableRows={visibleData.length > ROW_SCROLL_THRESHOLD}
        maxHeight="60vh"
      >
        <Flex direction="column" gap="0">
          {visibleData.map(d => {
            const population = d.total_pop_20 ?? 0;
            const fill = idealPopulation ? population / idealPopulation : 0;
            const overfull = fill > OVERFULL_RATIO;
            const color = getZoneColor(d.zone);
            const locked = lockPaintedAreas.includes(d.zone);
            const deviation = idealPopulation ? population - idealPopulation : undefined;
            const deviationLabel =
              deviation !== undefined && idealPopulation
                ? `${signedNumber(deviation)} vs. ideal (${deviation < 0 ? '−' : '+'}${formatNumber(
                    Math.abs(deviation / idealPopulation),
                    NUMBER_FORMATS.PERCENT
                  )})`
                : undefined;
            const hint =
              deviation !== undefined &&
              idealPopulation &&
              Math.abs(deviation / idealPopulation) > HINT_TOLERANCE
                ? signedCompact(deviation)
                : undefined;
            // Where the visible bar (fill or red excess) ends, in track %.
            const barEndPct = Math.min(fill, 1 / IDEAL_TICK) * IDEAL_TICK * 100;
            return (
              <Flex
                key={d.zone}
                align="center"
                gap="1"
                px="1"
                py="1"
                onClick={() => selectCommunity(d.zone)}
                className={`cursor-pointer rounded-md transition-colors duration-150 ${
                  selectedZone === d.zone ? 'bg-[var(--accent-3)]' : 'hover:bg-[var(--gray-2)]'
                }`}
                data-testid={`district-meter-row-${d.zone}`}
              >
                {/* Number + comment nest in the "District" column; lock follows
                    in its own column, aligned under the header's lock-all.
                    Icons manage their own interactions; don't let clicks
                    re-select the row. */}
                <Flex align="center" gap="1" style={{width: LABEL_COL_WIDTH, flexShrink: 0}}>
                  <Text size="2" weight={selectedZone === d.zone ? 'bold' : 'regular'}>
                    {d.zone}
                  </Text>
                  <Flex align="center" onClick={e => e.stopPropagation()}>
                    <ZoneDescriptionPopover zone={d.zone} color={color} />
                  </Flex>
                </Flex>
                {isEditing && (
                  <Flex align="center" flexShrink="0" onClick={e => e.stopPropagation()}>
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
                {/* Exact deviation lives in a hover tooltip; the bar and tick
                    carry the story visually. */}
                <Tooltip content={deviationLabel ?? ''} hidden={!deviationLabel}>
                  <Box flexGrow="1" style={{height: 8, position: 'relative'}}>
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
                          transition: 'width 150ms ease',
                        }}
                      />
                      {/* Population past ideal crosses the tick in red. */}
                      {fill > 1 && (
                        <Box
                          style={{
                            position: 'absolute',
                            left: `${IDEAL_TICK * 100}%`,
                            top: 0,
                            bottom: 0,
                            width: `${(Math.min(fill, 1 / IDEAL_TICK) - 1) * IDEAL_TICK * 100}%`,
                            background: 'var(--red-9)',
                            transition: 'width 150ms ease',
                          }}
                        />
                      )}
                    </Box>
                    {/* Per-row segment of the shared ideal line. The ±12px
                        overhang bridges the gap to the neighboring rows' bars.
                        ponytail: 12 = (32px row rhythm − 8px bar) / 2; if row
                        height changes the line gets gaps or overlap. */}
                    <Box
                      style={{
                        position: 'absolute',
                        left: `${IDEAL_TICK * 100}%`,
                        top: -12,
                        bottom: -12,
                        width: 2,
                        marginLeft: -1,
                        background: 'var(--gray-a6)',
                      }}
                    />
                    {/* Compact "how far to go" hint at the end of off-target
                        bars; capped so it never leaves the track (worst case it
                        overlaps a deep-red excess). */}
                    {hint && (
                      <Text
                        style={{
                          position: 'absolute',
                          left: `min(calc(${barEndPct}% + 6px), calc(100% - 34px))`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: 10,
                          lineHeight: '10px',
                          color: deviation && deviation > 0 ? 'var(--red-10)' : 'var(--gray-10)',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          fontVariantNumeric: 'tabular-nums',
                          transition: 'left 150ms ease',
                        }}
                      >
                        {hint}
                      </Text>
                    )}
                  </Box>
                </Tooltip>
                <Text
                  size="2"
                  color={overfull ? 'red' : 'gray'}
                  style={{
                    width: POP_COL_WIDTH,
                    textAlign: 'right',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatNumber(population, NUMBER_FORMATS.STRING)}
                </Text>
              </Flex>
            );
          })}
        </Flex>
      </ConditionalScrollArea>
      <ShowAllDistrictsButton
        showAll={showAll}
        onToggle={() => setShowAll(!showAll)}
        total={populationData.length}
        hiddenCount={hiddenCount}
      />
      {/* Plan-wide aggregates, aligned under the two numeric columns. */}
      <Flex
        align="start"
        gap="1"
        px="1"
        pt="2"
        mt="1"
        style={{borderTop: '1px solid var(--gray-4)'}}
      >
        <Box flexGrow="1" />
        {/* Captions are content-width and right-aligned; when wider than their
            column they overflow left into the empty footer space. */}
        <Flex direction="column" align="end" style={{width: DEV_COL_WIDTH, flexShrink: 0}}>
          <Text size="1" color="gray">
            max from ideal
          </Text>
          <Flex align="center" gap="0" style={{whiteSpace: 'nowrap'}}>
            <Text size="2" weight="bold" style={{fontVariantNumeric: 'tabular-nums'}}>
              {maxDeviation !== undefined ? signedNumber(maxDeviation) : '—'}
            </Text>
            <InfoTip tips="maxDeviation" />
          </Flex>
        </Flex>
        <Flex direction="column" align="end" style={{width: POP_COL_WIDTH, flexShrink: 0}}>
          <Text size="1" color="gray">
            top-to-bottom
          </Text>
          <Flex align="center" gap="0" style={{whiteSpace: 'nowrap'}}>
            <Text size="2" weight="bold" style={{fontVariantNumeric: 'tabular-nums'}}>
              {topToBottomPct !== undefined ? formatDeviationPct(topToBottomPct) : '—'}
            </Text>
            <InfoTip tips="topToBottomDeviation" />
          </Flex>
        </Flex>
      </Flex>

      {!allPainted && (
        <Text size="1" color="gray" mt="1">
          Plan totals appear when all districts are started
        </Text>
      )}
    </Flex>
  );
};
