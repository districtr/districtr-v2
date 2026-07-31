'use client';
import React from 'react';
import {Flex, IconButton, Tooltip} from '@radix-ui/themes';
import {LayoutIcon, RowsIcon} from '@radix-ui/react-icons';
import {StackedPanels} from './StackedPanels';
import {WorkflowTabs} from './WorkflowTabs';
import {VisualSettingsPopover} from '../Toolbar/VisualSettingsPopover';
import {useToolbarStore} from '@store/toolbarStore';

export const DataCards: React.FC = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const stackedSidebar = useToolbarStore(state => state.stackedSidebar);
  const setStackedSidebar = useToolbarStore(state => state.setStackedSidebar);
  // The stacked preference is a Super Draw escape hatch; plain Draw always
  // gets the workflow tabs, whatever a past Super Draw session persisted.
  const stacked = superDraw && stackedSidebar;

  const layoutToggle = superDraw ? (
    <Tooltip content={stacked ? 'Switch to tabbed layout' : 'Switch to stacked panels'}>
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
    </Tooltip>
  ) : null;

  return (
    <Flex direction="column" gap="2" data-testid="data-panels">
      {stacked ? (
        <>
          <Flex
            align="center"
            justify="between"
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
