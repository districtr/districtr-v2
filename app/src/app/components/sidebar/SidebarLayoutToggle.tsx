'use client';
import React from 'react';
import {IconButton} from '@radix-ui/themes';
import {LayoutIcon, RowsIcon} from '@radix-ui/react-icons';
import {useToolbarStore} from '@store/toolbarStore';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

/** Switches Super Draw's sidebar between tabbed and stacked-panel layouts.
 * Shared between the tab strip (tabbed layout) and KeyOptionToggles
 * (stacked layout) — same control, different surrounding chrome. */
export const SidebarLayoutToggle: React.FC = () => {
  const stackedSidebar = useToolbarStore(state => state.stackedSidebar);
  const setStackedSidebar = useToolbarStore(state => state.setStackedSidebar);

  return (
    <HelpTip tip="sidebarLayoutToggle" openDelay={HELP_TIP_HOVER_DELAY}>
      <IconButton
        variant="ghost"
        color="gray"
        size="1"
        onClick={() => setStackedSidebar(!stackedSidebar)}
        aria-label={stackedSidebar ? 'Switch to tabbed layout' : 'Switch to stacked panels'}
        data-testid="sidebar-layout-toggle"
      >
        {stackedSidebar ? <LayoutIcon /> : <RowsIcon />}
      </IconButton>
    </HelpTip>
  );
};
