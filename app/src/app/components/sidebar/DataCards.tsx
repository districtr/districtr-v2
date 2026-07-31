'use client';
import {Button, Flex, IconButton, SegmentedControl, Text, Tooltip} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ColorWheelIcon,
  Component1Icon,
  LayersIcon,
  PersonIcon,
  PieChartIcon,
  RowsIcon,
  LayoutIcon,
} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel, type SectionKey} from './SummaryPanel';
import {ToolSettings} from '../Toolbar/Settings';
import {MapControlsStore, useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {useUiHintStore} from '@store/uiHintStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';
import type {HelpTipKey} from '@components/HelpTip/helpTipContent';

// One constant drives both the CSS transition and the delayed unmount so the
// two can't drift apart.
const COLLAPSE_DURATION_MS = 200;

/** Shared height-collapse for the accordion sections and coalition expander.
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
 * live in one accordion section instead of two. Used by the legacy stacked
 * layout only; the workflow tabs split table and map across Stats/Map Layers. */
const TabbedSummaryPanel: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
  tabs: Array<{value: SectionKey; label: string}>;
  withCoalition?: boolean;
}> = ({defaultColumnSet, displayedColumnSets, tabs, withCoalition}) => {
  const [tab, setTab] = useState<SectionKey>(tabs[0].value);
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

type SidebarSectionKey = MapControlsStore['sidebarPanels'][number];

export type SidebarSection = {
  key: SidebarSectionKey;
  label: string;
  icon: React.ComponentType<{className?: string}>;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode, matching the old accordion's filter. */
  districtsOnly?: boolean;
  /** Contextual HelpTip key, shown by hovering the section's accordion header
   * itself (no separate icon — icons are reserved for inside the expanded
   * panels), if any. */
  helpTip?: HelpTipKey;
};

/** Registry for the legacy stacked-panels layout (the Super Draw fallback).
 * The mobile tab view derives its panel list from this too (see
 * DataPanelUtils). */
export const SECTIONS: SidebarSection[] = [
  {
    key: 'population',
    label: 'District overview',
    icon: Component1Icon,
    content: <PopulationPanel />,
    districtsOnly: true,
    helpTip: 'districtOverview',
  },
  {
    key: 'demography',
    label: 'Demographics',
    icon: PersonIcon,
    content: (
      <TabbedSummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        tabs={[
          {value: 'evaluation', label: 'Table'},
          {value: 'map', label: 'Map Layer'},
        ]}
        withCoalition
      />
    ),
    helpTip: 'demographics',
  },
  {
    key: 'election',
    label: 'Elections',
    icon: PieChartIcon,
    content: (
      <TabbedSummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        tabs={[
          {value: 'evaluation', label: 'Table'},
          {value: 'map', label: 'Map Layer'},
        ]}
      />
    ),
    districtsOnly: true,
    helpTip: 'elections',
  },
  {
    key: 'mapValidation',
    label: 'Validity check',
    icon: CheckCircledIcon,
    content: <MapValidation />,
    districtsOnly: true,
    helpTip: 'mapValidation',
  },
  {
    key: 'overlays',
    label: 'Boundaries and areas',
    icon: LayersIcon,
    content: <OverlaysPanel />,
    helpTip: 'boundariesAndAreas',
  },
];

const AccordionSection: React.FC<{
  section: SidebarSection;
  open: boolean;
  onToggle: () => void;
}> = ({section, open, onToggle}) => {
  const Icon = section.icon;
  // A real <button>: the row holds only Icon/Text/ChevronDownIcon, no nested
  // interactive content, and its own onClick (toggling the accordion) survives
  // being cloned by HelpTip below the same way it would on a div.
  const headerRow = (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="w-full cursor-pointer text-left p-3 rounded-lg transition-colors hover:bg-blue-50"
    >
      <Flex gap="2" align="center">
        <Icon className="shrink-0" />
        <Text size="2" weight="bold" className="flex-grow">
          {section.label}
        </Text>
        <ChevronDownIcon
          className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </Flex>
    </button>
  );
  return (
    <div
      className="border border-gray-300 rounded-lg bg-white"
      data-testid={`data-panel-${section.key}`}
    >
      {section.helpTip ? (
        <HelpTip tip={section.helpTip} openDelay={HELP_TIP_HOVER_DELAY}>
          {headerRow}
        </HelpTip>
      ) : (
        headerRow
      )}
      <AnimatedCollapse open={open}>
        <div className="px-3 pb-3">{section.content}</div>
      </AnimatedCollapse>
    </div>
  );
};

/** Legacy stacked accordion cards — the Super Draw opt-out layout. */
const StackedPanels: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const sidebarPanels = useMapControlsStore(state => state.sidebarPanels);
  const setSidebarPanels = useMapControlsStore(state => state.setSidebarPanels);

  const visibleSections = SECTIONS.filter(
    section => mapMode !== MAP_MODES.COI || !section.districtsOnly
  );

  const toggleSection = (key: SidebarSectionKey) =>
    setSidebarPanels(
      sidebarPanels.includes(key) ? sidebarPanels.filter(k => k !== key) : [...sidebarPanels, key]
    );

  return (
    <Flex direction="column" gap="2">
      {visibleSections.map(section => (
        <AccordionSection
          key={section.key}
          section={section}
          open={sidebarPanels.includes(section.key)}
          onToggle={() => toggleSection(section.key)}
        />
      ))}
    </Flex>
  );
};

/** A quiet section header inside a workflow tab: no card chrome, just a
 * heading row in the shared plane. Collapsible but open by default. */
const TabSection: React.FC<{label: string; helpTip?: HelpTipKey; children: React.ReactNode}> = ({
  label,
  helpTip,
  children,
}) => {
  const [open, setOpen] = useState(true);
  // Negative margin + matching padding: the button (and its hover wash) runs
  // the full panel width while the label stays on the same left edge as the
  // section content below it.
  const headerRow = (
    <button
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      className="w-auto cursor-pointer text-left -mx-2 px-2 py-3 rounded transition-colors hover:bg-[var(--gray-2)]"
    >
      <Flex align="center" justify="between">
        <Text size="3" weight="medium">
          {label}
        </Text>
        <ChevronDownIcon
          width={18}
          height={18}
          className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </Flex>
    </button>
  );
  return (
    <Flex direction="column">
      {helpTip ? (
        <HelpTip tip={helpTip} openDelay={HELP_TIP_HOVER_DELAY}>
          {headerRow}
        </HelpTip>
      ) : (
        headerRow
      )}
      <AnimatedCollapse open={open}>
        <div className="pb-3">{children}</div>
      </AnimatedCollapse>
    </Flex>
  );
};

/** Boundaries, demographic/election heatmaps, and map options as one flat
 * menu of layers. Demographics/elections expose just their map-layer
 * (choropleth) controls; their tables live in the Stats tab. */
const MapLayersPanel: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  return (
    // px matches the headers' negative margin: hover washes span the full
    // panel while header text and section content share one left edge.
    <Flex direction="column" px="2">
      <TabSection label="Boundaries and areas" helpTip="boundariesAndAreas">
        <OverlaysPanel />
      </TabSection>
      <TabSection label="Demographics" helpTip="demographics">
        <SummaryPanel
          defaultColumnSet={SUMMARY_TYPES.TOTPOP}
          displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
          sections={['map']}
        />
      </TabSection>
      {mapMode !== MAP_MODES.COI && (
        <TabSection label="Elections" helpTip="elections">
          <SummaryPanel
            defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
            displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
            sections={['map']}
          />
        </TabSection>
      )}
      {/* The Visual settings popover contents live here in the tabbed layout. */}
      <TabSection label="Map options">
        <ToolSettings />
      </TabSection>
    </Flex>
  );
};

/** Validity check plus the demographics/elections tables. Only reachable in
 * districts mode (the tab is districtsOnly), so no COI filtering here. */
const StatsPanel: React.FC = () => (
  <Flex direction="column" px="2">
    <TabSection label="Validity check" helpTip="mapValidation">
      <MapValidation />
    </TabSection>
    <TabSection label="Demographics" helpTip="demographics">
      <Flex direction="column" gap="2">
        <CoalitionExpander
          defaultColumnSet={SUMMARY_TYPES.TOTPOP}
          displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        />
        <SummaryPanel
          defaultColumnSet={SUMMARY_TYPES.TOTPOP}
          displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
          sections={['evaluation']}
        />
      </Flex>
    </TabSection>
    <TabSection label="Elections" helpTip="elections">
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        sections={['evaluation']}
      />
    </TabSection>
  </Flex>
);

export type WorkflowTabKey = 'population' | 'mapLayers' | 'stats';

/** The three workflow tabs, shared by Draw and Super Draw (the modes gate
 * density inside sections, not layout). */
const WORKFLOW_TABS: Array<{
  key: WorkflowTabKey;
  label: string;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode. */
  districtsOnly?: boolean;
}> = [
  {key: 'population', label: 'Population', content: <PopulationPanel />, districtsOnly: true},
  {key: 'mapLayers', label: 'Map Layers', content: <MapLayersPanel />},
  {key: 'stats', label: 'Stats', content: <StatsPanel />, districtsOnly: true},
];

/** Tab strip + active panel. Styled after the static site's SecondaryNav
 * (text links, bold + districtrBlue active state, hover underline) rather
 * than Radix Tabs chrome. */
const WorkflowTabs: React.FC<{layoutToggle: React.ReactNode}> = ({layoutToggle}) => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const visibleTabs = WORKFLOW_TABS.filter(tab => mapMode !== MAP_MODES.COI || !tab.districtsOnly);
  const [tab, setTab] = useState<WorkflowTabKey>(WORKFLOW_TABS[0].key);
  // Mode switches can hide the current tab; fall back to the first visible one.
  const activeKey = visibleTabs.some(t => t.key === tab) ? tab : visibleTabs[0].key;
  const activeTab = visibleTabs.find(t => t.key === activeKey);
  // One-shot tab request from other panels (e.g. "Find unassigned" jumps to
  // the Stats tab's completeness check).
  const sidebarTabRequest = useUiHintStore(state => state.sidebarTabRequest);
  const clearSidebarTabRequest = useUiHintStore(state => state.clearSidebarTabRequest);
  useEffect(() => {
    if (sidebarTabRequest) {
      setTab(sidebarTabRequest);
      clearSidebarTabRequest();
    }
  }, [sidebarTabRequest, clearSidebarTabRequest]);

  return (
    <Flex direction="column" gap="2">
      <nav aria-label="Sidebar panels" className="border-b border-gray-200 py-2 bg-white">
        <Flex direction="row" gapX="5" align="center" justify="center" position="relative">
          <div role="tablist" className="contents text-sm tracking-wider">
            {visibleTabs.map(t => {
              const active = t.key === activeKey;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  // pb-2/-mb-2 extend the button down through the nav's own
                  // bottom padding so the active border-b sits flush on the
                  // nav's border, underlining the top of the tab panel area.
                  className={`whitespace-nowrap cursor-pointer pb-2 -mb-2 border-b-2 hover:text-districtrBlue ${
                    active
                      ? 'text-districtrBlue font-bold border-districtrBlue'
                      : 'text-gray-600 border-transparent'
                  }`}
                >
                  {/* Invisible bold twin reserves the bold width so the row
                      doesn't reflow when the active tab's weight changes. */}
                  <span aria-hidden className="invisible block h-0 overflow-hidden font-bold">
                    {t.label}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>
          {layoutToggle && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">{layoutToggle}</div>
          )}
        </Flex>
      </nav>
      <div data-testid={`data-panel-${activeKey}`}>{activeTab?.content}</div>
    </Flex>
  );
};

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
          <Flex justify="end">{layoutToggle}</Flex>
          <StackedPanels />
        </>
      ) : (
        <WorkflowTabs layoutToggle={layoutToggle} />
      )}
    </Flex>
  );
};
