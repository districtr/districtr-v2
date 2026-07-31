'use client';
import React, {useEffect, useRef, useState} from 'react';
import {Flex, Text} from '@radix-ui/themes';
import {ChevronDownIcon} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import {AnimatedCollapse} from './AnimatedCollapse';
import {CoalitionExpander} from './CoalitionExpander';
import {ToolSettings} from '../Toolbar/Settings';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useUiHintStore} from '@store/uiHintStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES} from '@constants/demography/summary';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';
import type {HelpTipKey} from '@components/HelpTip/helpTipContent';

// Only the active tab's content mounts, so section collapse state would reset
// on every tab round-trip if it lived in component state alone. Write-through
// to this session-scoped record; keys are the `id` props (labels repeat across
// tabs, e.g. Demographics).
const sectionOpenState: Record<string, boolean> = {};

/** A quiet section header inside a workflow tab: no card chrome, just a
 * heading row in the shared plane. Collapsible but open by default. */
const TabSection: React.FC<{
  id: string;
  label: string;
  helpTip?: HelpTipKey;
  children: React.ReactNode;
}> = ({id, label, helpTip, children}) => {
  const [open, _setOpen] = useState(sectionOpenState[id] ?? true);
  const setOpen = (next: boolean) => {
    sectionOpenState[id] = next;
    _setOpen(next);
  };
  // Negative margin + matching padding (the panels' px="2"): the button and
  // its hover wash run the full panel width while the label stays on the same
  // left edge as the section content below it.
  const headerRow = (
    <button
      onClick={() => setOpen(!open)}
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
    <Flex direction="column" px="2">
      <TabSection id="layers-boundaries" label="Boundaries and areas" helpTip="boundariesAndAreas">
        <OverlaysPanel />
      </TabSection>
      <TabSection id="layers-demographics" label="Demographics" helpTip="demographics">
        <SummaryPanel
          defaultColumnSet={SUMMARY_TYPES.TOTPOP}
          displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
          sections={['map']}
        />
      </TabSection>
      {mapMode !== MAP_MODES.COI && (
        <TabSection id="layers-elections" label="Elections" helpTip="elections">
          <SummaryPanel
            defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
            displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
            sections={['map']}
          />
        </TabSection>
      )}
      <TabSection id="layers-options" label="Map options">
        <ToolSettings hideTitle />
      </TabSection>
    </Flex>
  );
};

/** Validity check plus the demographics/elections tables. Communities (COI)
 * maps keep the demographics table (as on the old accordion); validity and
 * elections are districts-only. */
const StatsPanel: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isCoi = mapMode === MAP_MODES.COI;
  return (
    <Flex direction="column" px="2">
      {!isCoi && (
        <TabSection id="stats-validity" label="Validity check" helpTip="mapValidation">
          <MapValidation />
        </TabSection>
      )}
      <TabSection id="stats-demographics" label="Demographics" helpTip="demographics">
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
      {!isCoi && (
        <TabSection id="stats-elections" label="Elections" helpTip="elections">
          <SummaryPanel
            defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
            displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
            sections={['evaluation']}
          />
        </TabSection>
      )}
    </Flex>
  );
};

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
  // Stats stays visible in COI for the demographics table; its districts-only
  // sections (validity, elections) are filtered inside StatsPanel.
  {key: 'stats', label: 'Stats', content: <StatsPanel />},
  {key: 'mapLayers', label: 'Map Layers', content: <MapLayersPanel />},
];

/** Tab strip + active panel, styled after the static site's SecondaryNav. */
export const WorkflowTabs: React.FC<{layoutToggle: React.ReactNode}> = ({layoutToggle}) => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const visibleTabs = WORKFLOW_TABS.filter(tab => mapMode !== MAP_MODES.COI || !tab.districtsOnly);
  const [tab, setTab] = useState<WorkflowTabKey>(WORKFLOW_TABS[0].key);
  // Mode switches can hide the current tab; fall back to the first visible one.
  const activeKey = visibleTabs.some(t => t.key === tab) ? tab : visibleTabs[0].key;
  const activeTab = visibleTabs.find(t => t.key === activeKey);
  // One-shot tab request from other panels (e.g. "Find unassigned" jumps to
  // the Stats tab's completeness check). A request that arrived while the tabs
  // were unmounted (stacked layout, eval view) is stale: the first effect run
  // after mount discards it instead of firing a surprise jump.
  const sidebarTabRequest = useUiHintStore(state => state.sidebarTabRequest);
  const clearSidebarTabRequest = useUiHintStore(state => state.clearSidebarTabRequest);
  const tabRequestsLive = useRef(false);
  useEffect(() => {
    const live = tabRequestsLive.current;
    tabRequestsLive.current = true;
    if (!sidebarTabRequest) return;
    clearSidebarTabRequest();
    if (live) setTab(sidebarTabRequest);
  }, [sidebarTabRequest, clearSidebarTabRequest]);

  // COI mode can leave a single visible tab; a one-tab strip is noise, but the
  // Super Draw layout toggle must stay reachable.
  const showStrip = visibleTabs.length > 1;

  return (
    <Flex direction="column" gap="2">
      {showStrip ? (
        <nav
          aria-label="Sidebar panels"
          // Sticky within the sidebar's scroll area (like the static site's
          // SecondaryNav) so long panels — the Stats tables — can't push the
          // tab strip out of reach.
          className="sticky top-0 z-10 border-b border-gray-200 py-2 bg-white overflow-x-auto"
        >
          {/* flex-1 spacers keep the tabs truly centered while pinning the
              layout toggle to the right edge — the same spot it occupies in
              the stacked layout's header row, so it doesn't move on switch. */}
          <Flex direction="row" align="center" className="w-full">
            <div className="flex-1" />
            <div className="flex gap-5 text-sm tracking-wider">
              {visibleTabs.map(t => {
                const active = t.key === activeKey;
                return (
                  <button
                    key={t.key}
                    aria-current={active || undefined}
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
            {/* pr-1 absorbs the ghost IconButton's -4px margin overhang,
                which would otherwise trip this scroll container into showing
                a horizontal scrollbar. */}
            <div className="flex-1 flex justify-end pr-1">{layoutToggle}</div>
          </Flex>
        </nav>
      ) : (
        layoutToggle && (
          <Flex
            justify="end"
            className="sticky top-0 z-10 border-b border-gray-200 py-2 pr-1 bg-white"
          >
            {layoutToggle}
          </Flex>
        )
      )}
      <div data-testid={`data-panel-${activeKey}`}>{activeTab?.content}</div>
    </Flex>
  );
};
