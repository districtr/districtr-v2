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
const DEV_COL_WIDTH = 84;
const POP_COL_WIDTH = 76;
// A district reads as overfull once it passes ideal population by 5%.
const OVERFULL_RATIO = 1.05;
const ROW_SCROLL_THRESHOLD = 10;
// Ideal population sits at a fixed tick partway along the track, so a bar can
// visibly cross it: the red excess segment past the tick shows how far over a
// district is (up to 1/IDEAL_TICK = 125% of ideal before clamping).
const IDEAL_TICK = 0.8;

// Unicode minus to match the tabular figures.
const signedNumber = (value: number) =>
  `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value), NUMBER_FORMATS.STRING)}`;

/**
 * District overview as a set of population meters: each district fills toward
 * ideal population, turning red once overfull. Two numeric columns (deviation
 * from ideal, total population) sit right of the meters with plan-wide
 * aggregates at the bottom.
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
        <Box flexGrow="1" />
        <Text
          size="1"
          color="gray"
          style={{width: DEV_COL_WIDTH, textAlign: 'right', flexShrink: 0}}
        >
          Vs. ideal
        </Text>
        <Text
          size="1"
          color="gray"
          style={{width: POP_COL_WIDTH, textAlign: 'right', flexShrink: 0}}
        >
          People
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
                  {/* Ideal-population tick, slightly taller than the bar. */}
                  <Box
                    style={{
                      position: 'absolute',
                      left: `${IDEAL_TICK * 100}%`,
                      top: -2,
                      bottom: -2,
                      width: 2,
                      marginLeft: -1,
                      borderRadius: 1,
                      background: 'var(--gray-8)',
                    }}
                  />
                </Box>
                <Text
                  size="2"
                  color={overfull ? 'red' : 'gray'}
                  style={{
                    width: DEV_COL_WIDTH,
                    textAlign: 'right',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {idealPopulation ? signedNumber(population - idealPopulation) : '—'}
                </Text>
                <Text
                  size="2"
                  color="gray"
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
