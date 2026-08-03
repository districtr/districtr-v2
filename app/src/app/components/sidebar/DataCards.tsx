'use client';
import React from 'react';
import {Flex, IconButton} from '@radix-ui/themes';
import {LayoutIcon, RowsIcon} from '@radix-ui/react-icons';
import {StackedPanels} from './StackedPanels';
import {WorkflowTabs} from './WorkflowTabs';
import {VisualSettingsPopover} from '../Toolbar/VisualSettingsPopover';
import {useToolbarStore} from '@store/toolbarStore';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

export const DataCards: React.FC = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const stackedSidebar = useToolbarStore(state => state.stackedSidebar);
  const setStackedSidebar = useToolbarStore(state => state.setStackedSidebar);
  // The stacked preference is a Super Draw escape hatch; plain Draw always
  // gets the workflow tabs, whatever a past Super Draw session persisted.
  const stacked = superDraw && stackedSidebar;

  const layoutToggle = superDraw ? (
    <HelpTip tip="sidebarLayoutToggle" openDelay={HELP_TIP_HOVER_DELAY}>
      <IconButton
        variant="ghost"
        color="gray"
        size="1"
        onClick={() => setStackedSidebar(!stackedSidebar)}
        aria-label={stacked ? 'Switch to tabbed layout' : 'Switch to stacked panels'}
        data-testid="sidebar-layout-toggle"
      >
        {stacked ? <LayoutIcon /> : <RowsIcon />}
      </IconButton>
    </HelpTip>
  ) : null;

  return (
    <Flex direction="column" gap="2" data-testid="data-panels">
      {stacked ? (
        <>
          {/* Right-aligned to match the toggle's spot in the tab strip, so
              the controls stay put when switching layouts. */}
          <Flex
            align="center"
            justify="end"
            gap="3"
            className="sticky top-0 z-10 border-b border-gray-200 py-2 pr-1 bg-white"
          >
            <VisualSettingsPopover />
            {layoutToggle}
          </Flex>
          <StackedPanels />
        </>
      ) : (
        <WorkflowTabs layoutToggle={layoutToggle} />
      )}
    </Flex>
  );
};
