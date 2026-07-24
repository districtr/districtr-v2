'use client';
import {Box, Flex, Tabs, Text} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import {ChevronDownIcon} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import {ToolSettings} from '../Toolbar/Settings';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useUiHintStore} from '@store/uiHintStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES} from '@constants/demography/summary';

// One constant drives both the CSS transition and the delayed unmount so the
// two can't drift apart.
const COLLAPSE_DURATION_MS = 200;

/** Shared height-collapse for the data-layer sections and coalition expander.
 * CSS grid-rows transition; children unmount once the close animation ends so
 * collapsed panels don't keep rendering or subscribing. */
const AnimatedCollapse: React.FC<{open: boolean; children: React.ReactNode}> = ({
  open,
  children,
}) => {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timeout = setTimeout(() => setMounted(false), COLLAPSE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [open]);
  return (
    <div
      className="grid transition-[grid-template-rows] ease-out"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transitionDuration: `${COLLAPSE_DURATION_MS}ms`,
      }}
    >
      <div className="min-h-0 overflow-hidden">{mounted ? children : null}</div>
    </div>
  );
};

/** A quiet section header in the Data Layers tab: no card chrome, just a
 * heading row in the shared plane. Collapsible but open by default. */
const DataLayerSection: React.FC<{label: string; children: React.ReactNode}> = ({
  label,
  children,
}) => {
  const [open, setOpen] = useState(true);
  return (
    <Flex direction="column">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full cursor-pointer text-left px-2 py-2 rounded transition-colors hover:bg-[var(--gray-2)]"
      >
        <Flex align="center" justify="between">
          <Text size="2" weight="medium">
            {label}
          </Text>
          <ChevronDownIcon
            className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </Flex>
      </button>
      <AnimatedCollapse open={open}>
        <Box pb="3">{children}</Box>
      </AnimatedCollapse>
    </Flex>
  );
};

/** Boundaries, demographics, and elections as one flat menu of layers.
 * Demographics/elections expose just their map-layer (heatmap) controls. */
const DataLayersPanel: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  return (
    <Flex direction="column">
      <DataLayerSection label="Boundaries and areas">
        <OverlaysPanel />
      </DataLayerSection>
      <DataLayerSection label="Demographics">
        <SummaryPanel
          defaultColumnSet={SUMMARY_TYPES.TOTPOP}
          displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
          sections={['map']}
        />
      </DataLayerSection>
      {mapMode !== MAP_MODES.COI && (
        <DataLayerSection label="Elections">
          <SummaryPanel
            defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
            displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
            sections={['map']}
          />
        </DataLayerSection>
      )}
      {/* The old Visual settings popover contents live here now. */}
      <DataLayerSection label="Map options">
        <ToolSettings />
      </DataLayerSection>
    </Flex>
  );
};

/** Validity check plus the demographics/elections tables. Only reachable in
 * districts mode (the tab is districtsOnly), so no COI filtering here. */
const EvaluationPanel: React.FC = () => (
  <Flex direction="column">
    <DataLayerSection label="Validity check">
      <MapValidation />
    </DataLayerSection>
    <DataLayerSection label="Demographics">
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        sections={['evaluation']}
      />
    </DataLayerSection>
    <DataLayerSection label="Elections">
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        sections={['evaluation']}
      />
    </DataLayerSection>
  </Flex>
);

export type SidebarSection = {
  key: string;
  label: string;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode. */
  districtsOnly?: boolean;
};

/** The three sidebar tabs, shared by Draw and Super Draw. The mobile tab view
 * derives its panel list from this too (see DataPanelUtils). */
export const SECTIONS: SidebarSection[] = [
  {
    key: 'population',
    label: 'Population',
    content: <PopulationPanel />,
    districtsOnly: true,
  },
  {
    key: 'dataLayers',
    label: 'Data Layers',
    content: <DataLayersPanel />,
  },
  {
    key: 'evaluation',
    label: 'Evaluation',
    content: <EvaluationPanel />,
    districtsOnly: true,
  },
];

export const DataCards: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const visibleSections = SECTIONS.filter(
    section => mapMode !== MAP_MODES.COI || !section.districtsOnly
  );
  const [tab, setTab] = useState(SECTIONS[0].key);
  // Mode switches can hide the current tab; fall back to the first visible one.
  const activeTab = visibleSections.some(s => s.key === tab) ? tab : visibleSections[0].key;
  // One-shot tab request from other panels (e.g. "Find unassigned" jumps to
  // the Evaluation tab's completeness check).
  const sidebarTabRequest = useUiHintStore(state => state.sidebarTabRequest);
  const clearSidebarTabRequest = useUiHintStore(state => state.clearSidebarTabRequest);
  useEffect(() => {
    if (sidebarTabRequest) {
      setTab(sidebarTabRequest);
      clearSidebarTabRequest();
    }
  }, [sidebarTabRequest, clearSidebarTabRequest]);

  return (
    <Flex direction="column" gap="2" data-testid="data-panels">
      <Tabs.Root value={activeTab} onValueChange={setTab}>
        <Tabs.List justify="center">
          {visibleSections.map(section => (
            <Tabs.Trigger key={section.key} value={section.key}>
              {section.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {visibleSections.map(section => (
          <Tabs.Content
            key={section.key}
            value={section.key}
            data-testid={`data-panel-${section.key}`}
          >
            <Box pt="2">{section.content}</Box>
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Flex>
  );
};
