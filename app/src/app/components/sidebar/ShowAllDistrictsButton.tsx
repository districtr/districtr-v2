'use client';
import React, {useState} from 'react';
import {Button} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';

/** Toggle under district tables that default to a subset of districts: the
 * started ones, or the pinned ones while any are pinned. Renders nothing when
 * every district is already visible. */
export const ShowAllDistrictsButton: React.FC<{
  showAll: boolean;
  onToggle: () => void;
  total: number;
  hiddenCount: number;
  subset?: 'started' | 'pinned';
}> = ({showAll, onToggle, total, hiddenCount, subset = 'started'}) =>
  hiddenCount > 0 ? (
    <Button
      variant="ghost"
      size="1"
      onClick={onToggle}
      style={{alignSelf: 'start', fontWeight: 600}}
      mx="1"
      my="1"
    >
      {showAll ? `Show only ${subset} districts` : `Show all ${total} districts`}
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

/** Pinned-districts filter for a district table: `filter` narrows rows to the
 * pinned districts, and `toggle` shows this table's other rows again. Rows
 * without a district number (universe or unassigned totals) always stay.
 * `enabled` false (COI tables, single-district views) passes rows through. */
export const usePinnedFilter = (total: number, enabled = true) => {
  const allPinnedZones = usePinnedZones();
  const pinnedZones = enabled ? allPinnedZones : [];
  const [showAll, setShowAll] = useState(false);
  const active = pinnedZones.length > 0 && !showAll;
  const filter = <T extends {zone?: unknown}>(rows: T[]) =>
    active
      ? rows.filter(({zone}) => typeof zone !== 'number' || zone <= 0 || pinnedZones.includes(zone))
      : rows;
  const toggle = pinnedZones.length > 0 && (
    <ShowAllDistrictsButton
      showAll={showAll}
      onToggle={() => setShowAll(!showAll)}
      total={total}
      hiddenCount={total - pinnedZones.length}
      subset="pinned"
    />
  );
  return {filter, toggle};
};
