'use client';
import React, {useEffect, useState} from 'react';
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
 * heading row in the shared plane. Collapsible but open by default. */
const TabSection: React.FC<{label: string; helpTip?: HelpTipKey; children: React.ReactNode}> = ({
  label,
  helpTip,
  children,
}) => {
  const [open, setOpen] = useState(true);
  // Negative margin + matching padding (the panels' px="2"): the button and
  // its hover wash run the full panel width while the label stays on the same
  // left edge as the section content below it.
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
      <TabSection label="Map options">
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
        <TabSection label="Validity check" helpTip="mapValidation">
          <MapValidation />
        </TabSection>
      )}
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
      {!isCoi && (
        <TabSection label="Elections" helpTip="elections">
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
  {key: 'mapLayers', label: 'Map Layers', content: <MapLayersPanel />},
  // Stats stays visible in COI for the demographics table; its districts-only
  // sections (validity, elections) are filtered inside StatsPanel.
  {key: 'stats', label: 'Stats', content: <StatsPanel />},
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
  // the Stats tab's completeness check).
  const sidebarTabRequest = useUiHintStore(state => state.sidebarTabRequest);
  const clearSidebarTabRequest = useUiHintStore(state => state.clearSidebarTabRequest);
  useEffect(() => {
    if (sidebarTabRequest) {
      setTab(sidebarTabRequest);
      clearSidebarTabRequest();
    }
  }, [sidebarTabRequest, clearSidebarTabRequest]);
  // A request issued while the tabs are unmounted (stacked layout, eval view)
  // must not linger and fire a surprise jump on a later mount.
  useEffect(() => clearSidebarTabRequest, [clearSidebarTabRequest]);

  // COI mode can leave a single visible tab; a one-tab strip is noise, but the
  // Super Draw layout toggle must stay reachable.
  const showStrip = visibleTabs.length > 1;

  return (
    <Flex direction="column" gap="2">
      {showStrip ? (
        <nav
          aria-label="Sidebar panels"
          className="border-b border-gray-200 py-2 bg-white overflow-x-auto"
        >
          <Flex direction="row" gapX="5" align="center" justify="center" position="relative">
            <div className="contents text-sm tracking-wider">
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
            {layoutToggle && <Flex flexShrink="0">{layoutToggle}</Flex>}
          </Flex>
        </nav>
      ) : (
        layoutToggle && <Flex justify="end">{layoutToggle}</Flex>
      )}
      <div data-testid={`data-panel-${activeKey}`}>{activeTab?.content}</div>
    </Flex>
  );
};
