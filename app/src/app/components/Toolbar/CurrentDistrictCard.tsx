'use client';
import React from 'react';
import {Box, Button, Flex, Popover, Text} from '@radix-ui/themes';
import {LockClosedIcon, LockOpen2Icon, Pencil1Icon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {ZoneDescriptionContent} from '@/app/components/ZoneDescriptions/ZoneDescriptionContent';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ACCESS_STATES} from '@constants/document/state';

/**
 * Concept 1a: makes the invisible current-state explicit — which district
 * you're painting, its color, and how full it is — and gives the two
 * per-district actions (lock, description) visible labeled buttons.
 * Children (the zone picker pips) render inside the card.
 */
export const CurrentDistrictCard: React.FC<{children: React.ReactNode}> = ({children}) => {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const access = useMapStore(state => state.mapStatus?.access);
  const description = useMapStore(state => state.getZoneDescriptionForZone(selectedZone));
  const getZoneColor = useZoneColorGetter();
  const {populationData} = useZonePopulations();
  const {summaryStats} = useSummaryStats();

  const idealPopulation = summaryStats?.idealpop;
  const population = populationData.find(d => d.zone === selectedZone)?.total_pop_20 ?? 0;
  // Uncapped so the percent readout can say 112% when overfull; the swatch
  // fill itself tops out at full.
  const fillPct = idealPopulation ? population / idealPopulation : 0;
  const color = getZoneColor(selectedZone);
  const locked = lockPaintedAreas.includes(selectedZone);
  const isReadOnly = access === ACCESS_STATES.READ;

  const toggleLock = () => {
    setLockedZones(
      locked
        ? lockPaintedAreas.filter(zone => zone !== selectedZone)
        : [...lockPaintedAreas, selectedZone]
    );
  };

  return (
    <Flex direction="column" gap="2" width="100%" data-testid="current-district-card">
      <Flex align="center" gap="2" wrap="wrap">
        {/* Outlined swatch that fills bottom-up as the district approaches
            ideal population. */}
        <Box
          flexShrink="0"
          width="28px"
          height="28px"
          style={{
            borderRadius: 8,
            border: `2px solid ${color}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: `${Math.min(1, fillPct) * 100}%`,
              background: color,
              transition: 'height 150ms ease',
            }}
          />
        </Box>
        <Flex direction="column" flexGrow="1">
          <Text size="2" weight="bold">
            Painting District {selectedZone}
          </Text>
          {!!idealPopulation && (
            <Text size="1" color="gray">
              {formatNumber(population, NUMBER_FORMATS.STRING)} /{' '}
              {formatNumber(idealPopulation, NUMBER_FORMATS.STRING)} ({Math.round(fillPct * 100)}%)
            </Text>
          )}
        </Flex>
        {isEditing && (
          <Flex gap="2" flexShrink="0" wrap="wrap">
            <Button
              size="1"
              variant="surface"
              color="gray"
              onClick={toggleLock}
              disabled={isReadOnly}
            >
              {locked ? <LockClosedIcon /> : <LockOpen2Icon />}
              {locked ? 'Unlock district' : 'Lock district'}
            </Button>
            <Popover.Root>
              <Popover.Trigger>
                <Button size="1" variant="surface" color="gray" disabled={isReadOnly}>
                  <Pencil1Icon />
                  {description ? 'Edit description' : 'Add description'}
                </Button>
              </Popover.Trigger>
              <Popover.Content style={{width: 300}} align="start">
                <ZoneDescriptionContent zone={selectedZone} color={color} showEditingControls />
              </Popover.Content>
            </Popover.Root>
          </Flex>
        )}
      </Flex>
      {children}
    </Flex>
  );
};
