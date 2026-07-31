'use client';
import React from 'react';
import {SummaryPanel} from './SummaryPanel';
import {Expander} from './AnimatedCollapse';
import {useToolbarStore} from '@store/toolbarStore';
import type {SummaryType} from '@constants/demography/summary';

/** Collapsible, opt-in coalition builder attached above the demographics
 * table/map instead of floating as its own tab. Super Draw only — self-gated
 * so every render site inherits the rule. */
export const CoalitionExpander: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
}> = ({defaultColumnSet, displayedColumnSets}) => {
  const superDraw = useToolbarStore(state => state.superDraw);
  if (!superDraw) return null;
  return (
    <Expander label="Create a coalition (optional)">
      <SummaryPanel
        defaultColumnSet={defaultColumnSet}
        displayedColumnSets={displayedColumnSets}
        sections={['coalition']}
      />
    </Expander>
  );
};
