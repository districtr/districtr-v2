'use client';
import React, {useState} from 'react';
import {Button, Flex} from '@radix-ui/themes';
import {ChevronDownIcon, ColorWheelIcon} from '@radix-ui/react-icons';
import {SummaryPanel} from './SummaryPanel';
import {AnimatedCollapse} from './AnimatedCollapse';
import {useToolbarStore} from '@store/toolbarStore';
import type {SummaryType} from '@constants/demography/summary';

/** Collapsible, opt-in coalition builder attached above the demographics
 * table/map instead of floating as its own tab. Super Draw only — self-gated
 * so every render site inherits the rule. */
export const CoalitionExpander: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
}> = ({defaultColumnSet, displayedColumnSets}) => {
  const [open, setOpen] = useState(false);
  const superDraw = useToolbarStore(state => state.superDraw);
  if (!superDraw) return null;
  return (
    <Flex direction="column" gap="2">
      <Button
        variant="surface"
        color="gray"
        size="2"
        onClick={() => setOpen(o => !o)}
        className="w-full cursor-pointer"
      >
        <Flex align="center" justify="between" width="100%">
          <Flex align="center" gap="2">
            <ColorWheelIcon />
            Create a coalition (optional)
          </Flex>
          <ChevronDownIcon
            className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </Flex>
      </Button>
      <AnimatedCollapse open={open}>
        <SummaryPanel
          defaultColumnSet={defaultColumnSet}
          displayedColumnSets={displayedColumnSets}
          sections={['coalition']}
        />
      </AnimatedCollapse>
    </Flex>
  );
};
