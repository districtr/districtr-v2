'use client';
import React, {useEffect, useRef} from 'react';
import {Flex, Text} from '@radix-ui/themes';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  Component1Icon,
  LayersIcon,
  PersonIcon,
  PieChartIcon,
} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import {AnimatedCollapse} from './AnimatedCollapse';
import {CoalitionExpander} from './CoalitionExpander';
import {MapControlsStore, useMapControlsStore} from '@store/mapControlsStore';
import {useGuideTarget} from '@store/uiHintStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';
import type {HelpTipKey} from '@components/HelpTip/helpTipContent';

/** Card content for the stacked demographics/elections cards: coalition
 * expander (the one collapsible), then the map-layer controls rendered flat —
 * the display-mode cards are their own progressive-disclosure trigger — then
 * the table, always visible. Used by the legacy stacked layout only; the
 * workflow tabs split map and table across Map Layers/Stats. */
const SummaryCardContent: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
  withCoalition?: boolean;
}> = ({defaultColumnSet, displayedColumnSets, withCoalition}) => (
  <Flex direction="column" gap="4">
    {withCoalition && (
      <CoalitionExpander
        defaultColumnSet={defaultColumnSet}
        displayedColumnSets={displayedColumnSets}
      />
    )}
    <SummaryPanel
      defaultColumnSet={defaultColumnSet}
      displayedColumnSets={displayedColumnSets}
      sections={['map']}
    />
    <SummaryPanel
      defaultColumnSet={defaultColumnSet}
      displayedColumnSets={displayedColumnSets}
      sections={['evaluation']}
    />
  </Flex>
);

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
      <SummaryCardContent
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
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
      <SummaryCardContent
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
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
  // Stacked-layout twin of WorkflowTabs' TabSection guide consumer.
  const {guiding, flashing} = useGuideTarget(`panel:${section.key}`, open);
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (guiding) sectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, [guiding]);
  // A real <button>: the row holds only Icon/Text/ChevronDownIcon, no nested
  // interactive content, and its own onClick (toggling the accordion) survives
  // being cloned by HelpTip below the same way it would on a div.
  const headerRow = (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className={`w-full cursor-pointer text-left p-3 rounded-lg transition-colors hover:bg-blue-50 ${
        guiding ? 'ui-guide' : ''
      }`}
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
      className={`border border-gray-300 rounded-lg bg-white ${flashing ? 'ui-flash' : ''}`}
      data-testid={`data-panel-${section.key}`}
      ref={sectionRef}
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

export const StackedPanels: React.FC = () => {
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
