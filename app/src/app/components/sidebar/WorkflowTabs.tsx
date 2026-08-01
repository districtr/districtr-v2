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

/** A quiet section header inside a workflow tab: no card chrome, just a
 * heading row in the shared plane. Collapsible but open by default; collapse
 * state lives in mapControlsStore (tab content unmounts on switch), keyed by
 * `id` since labels repeat across tabs (e.g. Demographics). */
const TabSection: React.FC<{
  id: string;
  label: string;
  helpTip?: HelpTipKey;
  children: React.ReactNode;
}> = ({id, label, helpTip, children}) => {
  const open = useMapControlsStore(state => !state.collapsedTabSections.includes(id));
  const toggleTabSection = useMapControlsStore(state => state.toggleTabSection);
  // Helper hints pulse the section they just pointed the user at.
  const flashing = useUiHintStore(state => state.flashTarget === `section:${id}`);
  // -mx-2 + px-2 (matching the panels' px="2"): the hover wash spans the full
  // panel while the label shares the content's left edge.
  const headerRow = (
    <button
      onClick={() => toggleTabSection(id)}
      aria-expanded={open}
      className="w-auto cursor-pointer text-left -mx-2 px-2 py-3 rounded transition-colors hover:bg-[var(--gray-2)]"
    >
      <Flex align="center" justify="between">
        <Text size="3" className="font-semibold">
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
    <Flex direction="column" className={flashing ? 'ui-flash' : ''} data-section-id={id}>
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
        <ToolSettings inWorkflowTab />
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
  // One-shot tab request (see uiHintStore). Requests that arrived while the
  // tabs were unmounted are stale: the first effect run after mount discards
  // them instead of firing a surprise jump.
  const sidebarTabRequest = useUiHintStore(state => state.requests.sidebarTab);
  const clearRequest = useUiHintStore(state => state.clear);
  const flashTarget = useUiHintStore(state => state.flashTarget);
  const tabRequestsLive = useRef(false);
  useEffect(() => {
    const live = tabRequestsLive.current;
    tabRequestsLive.current = true;
    if (!sidebarTabRequest) return;
    clearRequest('sidebarTab');
    if (live) setTab(sidebarTabRequest);
  }, [sidebarTabRequest, clearRequest]);

  // A one-tab strip (COI) is noise; the Super Draw toggle must stay reachable.
  const showStrip = visibleTabs.length > 1;

  return (
    <Flex direction="column" gap="2">
      {showStrip ? (
        <nav
          aria-label="Sidebar panels"
          // Sticky so long panels (the Stats tables) can't scroll the strip
          // out of reach.
          className="sticky top-0 z-10 border-b border-gray-200 py-2 bg-white overflow-x-auto"
        >
          {/* flex-1 spacers center the tabs while pinning the toggle right —
              the same spot it holds in the stacked header row. */}
          <Flex direction="row" align="center" className="w-full">
            <div className="flex-1" />
            <div className="flex gap-5 text-sm tracking-wider">
              {visibleTabs.map(t => {
                const active = t.key === activeKey;
                // Helper jumps pulse the destination tab label first (see
                // jumpToSection) so the cut to another tab reads as a path.
                const flashing = flashTarget === `tab:${t.key}`;
                return (
                  <button
                    key={t.key}
                    aria-current={active || undefined}
                    onClick={() => setTab(t.key)}
                    // pb-2/-mb-2 extend the button through the nav's padding
                    // so the active border-b sits flush on the nav's border.
                    className={`whitespace-nowrap cursor-pointer pb-2 -mb-2 border-b-2 hover:text-districtrBlue ${
                      active
                        ? 'text-districtrBlue font-bold border-districtrBlue'
                        : 'text-gray-600 border-transparent'
                    } ${flashing ? 'ui-flash' : ''}`}
                  >
                    {/* Invisible bold twin reserves bold width so tabs don't
                        shift when the active weight changes. */}
                    <span aria-hidden className="invisible block h-0 overflow-hidden font-bold">
                      {t.label}
                    </span>
                    {t.label}
                  </button>
                );
              })}
            </div>
            {/* pr-1 absorbs the ghost IconButton's -4px margin, which would
                otherwise give this scroll container a horizontal scrollbar. */}
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
