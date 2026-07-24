'use client';
import {Box, Button, Flex, SegmentedControl, Tabs, Text} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import {ChevronDownIcon, ColorWheelIcon} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel, type SectionKey} from './SummaryPanel';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useUiHintStore} from '@store/uiHintStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';

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

/** Collapsible, opt-in coalition builder attached above the demographics
 * table/map instead of floating as its own tab. */
const CoalitionExpander: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
}> = ({defaultColumnSet, displayedColumnSets}) => {
  const [open, setOpen] = useState(false);
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

/** Table / Map tabs over a single SummaryPanel section, so the table and map
 * live in one section instead of two. */
const TabbedSummaryPanel: React.FC<{
  panelKey: 'demography' | 'election';
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
  tabs: Array<{value: SectionKey; label: string}>;
  withCoalition?: boolean;
}> = ({panelKey, defaultColumnSet, displayedColumnSets, tabs, withCoalition}) => {
  const [tab, setTab] = useState<SectionKey>(tabs[0].value);
  // One-shot tab request from UI hints (same pattern as MapValidation's
  // validationTabRequest).
  const summaryTabRequest = useUiHintStore(state => state.summaryTabRequest);
  const clearSummaryTabRequest = useUiHintStore(state => state.clearSummaryTabRequest);
  useEffect(() => {
    if (summaryTabRequest?.panel === panelKey) {
      setTab(summaryTabRequest.tab);
      clearSummaryTabRequest();
    }
  }, [summaryTabRequest, panelKey, clearSummaryTabRequest]);
  // Opening the Map Layer tab shows the choropleth controls but doesn't turn
  // the overlay on — the user enables it from the display-mode control.
  return (
    <Flex direction="column" gap="2">
      {withCoalition && (
        <CoalitionExpander
          defaultColumnSet={defaultColumnSet}
          displayedColumnSets={displayedColumnSets}
        />
      )}
      <SegmentedControl.Root size="2" value={tab} onValueChange={v => setTab(v as SectionKey)}>
        {tabs.map(t => (
          <SegmentedControl.Item key={t.value} value={t.value}>
            {t.label}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
      <SummaryPanel
        defaultColumnSet={defaultColumnSet}
        displayedColumnSets={displayedColumnSets}
        sections={[tab]}
      />
    </Flex>
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
        className="w-full cursor-pointer text-left py-2 rounded transition-colors hover:bg-[var(--gray-2)]"
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

/** Demographics, elections, and boundaries as one flat menu of layers. */
const DataLayersPanel: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  return (
    <Flex direction="column">
      <DataLayerSection label="Demographics">
        <TabbedSummaryPanel
          panelKey="demography"
          defaultColumnSet={SUMMARY_TYPES.TOTPOP}
          displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
          tabs={[
            {value: 'evaluation', label: 'Table'},
            {value: 'map', label: 'Map Layer'},
          ]}
          withCoalition
        />
      </DataLayerSection>
      {mapMode !== MAP_MODES.COI && (
        <DataLayerSection label="Elections">
          <TabbedSummaryPanel
            panelKey="election"
            defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
            displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
            tabs={[
              {value: 'evaluation', label: 'Table'},
              {value: 'map', label: 'Map Layer'},
            ]}
          />
        </DataLayerSection>
      )}
      <DataLayerSection label="Boundaries and areas">
        <OverlaysPanel />
      </DataLayerSection>
    </Flex>
  );
};

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
    content: <MapValidation />,
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

  return (
    <Flex direction="column" gap="2" data-testid="data-panels">
      <Tabs.Root value={activeTab} onValueChange={setTab}>
        <Tabs.List>
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
