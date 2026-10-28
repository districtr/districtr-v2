'use client';
import React from 'react';
import {Button, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import type {Zone} from '@constants/map/zone';

/** Toggle under district tables that default to started-districts-only.
 * Renders nothing when every district is already visible. */
export const ShowAllDistrictsButton: React.FC<{
  showAll: boolean;
  onToggle: () => void;
  total: number;
  hiddenCount: number;
}> = ({showAll, onToggle, total, hiddenCount}) =>
  hiddenCount > 0 ? (
    <Button
      variant="ghost"
      size="1"
      onClick={onToggle}
      style={{alignSelf: 'start', fontWeight: 600}}
      mx="1"
      my="1"
    >
      {showAll ? 'Show only started districts' : `Show all ${total} districts`}
    </Button>
  ) : null;

/** Pinned districts, active only in Super Draw: pins are set from its meters,
 * so outside it they'd filter tables with no way to unpin. Kept in the store
 * either way, so they come back on returning to Super Draw. */
export const usePinnedZones = () => {
  const pinnedZones = useMapControlsStore(state => state.pinnedZones);
  const superDraw = useToolbarStore(state => state.superDraw);
  return superDraw ? pinnedZones : [];
};

/** Rows of the pinned districts. Rows without a district number (universe or
 * unassigned totals) always stay. */
export const filterPinnedRows = <T extends {zone?: unknown}>(rows: T[], pinnedZones: Zone[]) =>
  rows.filter(({zone}) => typeof zone !== 'number' || zone <= 0 || pinnedZones.includes(zone));

/** What the line atop a pinned table says, e.g. "Showing pinned districts 3, 7". */
export const pinnedFilterLabel = (pinnedZones: Zone[], showAll: boolean) => {
  const zones = [...pinnedZones].sort((a, b) => a - b).join(', ');
  if (showAll) return `Showing all districts (pinned: ${zones})`;
  return `Showing pinned district${pinnedZones.length === 1 ? '' : 's'} ${zones}`;
};

const PinnedFilterLine: React.FC<{pinnedZones: Zone[]; hiddenCount: number}> = ({
  pinnedZones,
  hiddenCount,
}) => {
  const showAll = useMapControlsStore(state => state.showAllPinned);
  const setShowAll = useMapControlsStore(state => state.setShowAllPinned);
  const clearPinnedZones = useMapControlsStore(state => state.clearPinnedZones);
  return (
    <Flex align="center" gap="2" wrap="wrap" px="1" pb="2">
      <Text size="1" color="gray">
        {pinnedFilterLabel(pinnedZones, showAll)}
      </Text>
      {hiddenCount > 0 && (
        <>
          <Text size="1" color="gray" aria-hidden>
            ·
          </Text>
          <Button
            variant="ghost"
            size="1"
            onClick={() => setShowAll(!showAll)}
            style={{fontWeight: 600}}
          >
            {showAll ? 'Show pinned only' : 'Show all'}
          </Button>
        </>
      )}
      <Text size="1" color="gray" aria-hidden>
        ·
      </Text>
      <Button variant="ghost" size="1" onClick={clearPinnedZones} style={{fontWeight: 600}}>
        Clear pins
      </Button>
    </Flex>
  );
};

/** Pinned-districts filter for a district table: `filter` narrows rows to the
 * pinned districts unless the shared "show all" is on, and `line` goes at the
 * top of the table to say so and offer Show all / Clear pins. `enabled` false
 * (COI tables, single-district views) passes rows through. */
export const usePinnedFilter = (total: number, enabled = true) => {
  const allPinnedZones = usePinnedZones();
  const showAll = useMapControlsStore(state => state.showAllPinned);
  const pinnedZones = enabled ? allPinnedZones : [];
  const pinning = pinnedZones.length > 0;
  const filtering = pinning && !showAll;
  const filter = <T extends {zone?: unknown}>(rows: T[]) =>
    filtering ? filterPinnedRows(rows, pinnedZones) : rows;
  const line = pinning && (
    <PinnedFilterLine pinnedZones={pinnedZones} hiddenCount={total - pinnedZones.length} />
  );
  return {filter, line, filtering};
};
