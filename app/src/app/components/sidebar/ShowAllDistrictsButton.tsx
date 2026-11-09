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

/** Focused districts, active only in Super Draw: focus is set from its meters,
 * so outside it a focused-only table would have no way to clear it. Kept in the
 * store either way, so it comes back on returning to Super Draw. */
export const useFocusedZones = () => {
  const focusedZones = useMapControlsStore(state => state.focusedZones);
  const superDraw = useToolbarStore(state => state.superDraw);
  return superDraw ? focusedZones : [];
};

/** Rows of the focused districts. Rows without a district number (universe or
 * unassigned totals) always stay. */
export const filterFocusedRows = <T extends {zone?: unknown}>(rows: T[], focusedZones: Zone[]) =>
  rows.filter(({zone}) => typeof zone !== 'number' || zone <= 0 || focusedZones.includes(zone));

/** What the line atop a table with focused districts says, e.g. "Focused: 3, 7". */
export const focusFilterLabel = (focusedZones: Zone[], focusedOnly: boolean) => {
  const zones = [...focusedZones].sort((a, b) => a - b).join(', ');
  if (focusedOnly)
    return `Showing focused district${focusedZones.length === 1 ? '' : 's'} ${zones}`;
  return `Focused: ${zones}`;
};

const FocusFilterLine: React.FC<{focusedZones: Zone[]; hiddenCount: number}> = ({
  focusedZones,
  hiddenCount,
}) => {
  const focusedOnly = useMapControlsStore(state => state.showFocusedOnly);
  const setFocusedOnly = useMapControlsStore(state => state.setShowFocusedOnly);
  const clearFocusedZones = useMapControlsStore(state => state.clearFocusedZones);
  return (
    <Flex align="center" gap="2" wrap="wrap" px="1" pb="2">
      <Text size="1" color="gray">
        {focusFilterLabel(focusedZones, focusedOnly)}
      </Text>
      {hiddenCount > 0 && (
        <>
          <Text size="1" color="gray" aria-hidden>
            ·
          </Text>
          <Button
            variant="ghost"
            size="1"
            onClick={() => setFocusedOnly(!focusedOnly)}
            aria-pressed={focusedOnly}
            style={{fontWeight: 600}}
          >
            {focusedOnly ? 'Show all' : 'Show focused districts'}
          </Button>
        </>
      )}
      <Text size="1" color="gray" aria-hidden>
        ·
      </Text>
      <Button variant="ghost" size="1" onClick={clearFocusedZones} style={{fontWeight: 600}}>
        Clear focus
      </Button>
    </Flex>
  );
};

/** Focused-districts filter for a district table. Focusing alone filters
 * nothing: `filter` narrows rows to the focused districts only once the shared
 * "Show focused districts" is on, and `line` goes at the top of the table to
 * list them and offer that toggle and Clear focus. `enabled` false (COI tables,
 * single-district views) passes rows through. */
export const useFocusFilter = (total: number, enabled = true) => {
  const allFocusedZones = useFocusedZones();
  const focusedOnly = useMapControlsStore(state => state.showFocusedOnly);
  const focusedZones = enabled ? allFocusedZones : [];
  const focusing = focusedZones.length > 0;
  const filtering = focusing && focusedOnly;
  const filter = <T extends {zone?: unknown}>(rows: T[]) =>
    filtering ? filterFocusedRows(rows, focusedZones) : rows;
  const line = focusing && (
    <FocusFilterLine focusedZones={focusedZones} hiddenCount={total - focusedZones.length} />
  );
  return {filter, line, filtering};
};
