'use client';
import React from 'react';
import {Flex} from '@radix-ui/themes';
import {StackedPanels} from './StackedPanels';
import {WorkflowTabs} from './WorkflowTabs';
import {SidebarLayoutToggle} from './SidebarLayoutToggle';
import {useToolbarStore} from '@store/toolbarStore';

export const DataCards: React.FC = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const stackedSidebar = useToolbarStore(state => state.stackedSidebar);
  // The stacked preference is a Super Draw escape hatch; plain Draw always
  // gets the workflow tabs, whatever a past Super Draw session persisted.
  const stacked = superDraw && stackedSidebar;

  // Tabbed layout keeps the toggle in its tab strip; the stacked layout's
  // toggle (plus Visual settings) lives at the bottom of ToolControlsScaffold's
  // right column instead (see KeyOptionToggles).
  const layoutToggle = superDraw && !stacked ? <SidebarLayoutToggle /> : null;

  return (
    <Flex direction="column" gap="2" data-testid="data-panels">
      {stacked ? <StackedPanels /> : <WorkflowTabs layoutToggle={layoutToggle} />}
    </Flex>
  );
};
