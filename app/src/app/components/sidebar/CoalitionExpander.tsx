'use client';
import React from 'react';
import {SummaryPanel} from './SummaryPanel';
import {Expander} from './AnimatedCollapse';
import {useCoalitionsEnabled} from '@/app/hooks/useCoalitionsEnabled';
import type {SummaryType} from '@constants/demography/summary';

/** Collapsible, opt-in coalition builder attached above the demographics
 * table/map instead of floating as its own tab. Self-gated (see
 * useCoalitionsEnabled) so every render site inherits the rule. */
export const CoalitionExpander: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
}> = ({defaultColumnSet, displayedColumnSets}) => {
  const coalitionsEnabled = useCoalitionsEnabled();
  if (!coalitionsEnabled) return null;
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
