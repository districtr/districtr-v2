'use client';
import {Button, Flex, SegmentedControl, Text} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ColorWheelIcon,
  Component1Icon,
  LayersIcon,
  PersonIcon,
  PieChartIcon,
} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel, type SectionKey} from './SummaryPanel';
import {MapControlsStore, useMapControlsStore} from '@store/mapControlsStore';
import {activateOverlayGroup} from '@utils/demography/overlayMemory';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';

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
    const timeout = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(timeout);
  }, [open]);
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{gridTemplateRows: open ? '1fr' : '0fr'}}
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
 * live in one accordion section instead of two. */
const TabbedSummaryPanel: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
  tabs: Array<{value: SectionKey; label: string}>;
  mapGroup: SummaryType;
  withCoalition?: boolean;
}> = ({defaultColumnSet, displayedColumnSets, tabs, mapGroup, withCoalition}) => {
  const [tab, setTab] = useState<SectionKey>(tabs[0].value);
  const handleTabChange = (v: string) => {
    setTab(v as SectionKey);
    // Opening the Map tab turns the choropleth overlay on with the last-used
    // (or default) settings for this column group. The overlay intentionally
    // stays on when navigating away — it's turned off from the Visual settings
    // toggles or the display-mode control.
    if (v === 'map') activateOverlayGroup(mapGroup);
  };
  return (
    <Flex direction="column" gap="2">
      {withCoalition && (
        <CoalitionExpander
          defaultColumnSet={defaultColumnSet}
          displayedColumnSets={displayedColumnSets}
        />
      )}
      <SegmentedControl.Root size="2" value={tab} onValueChange={handleTabChange}>
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
  description: string;
  icon: React.ComponentType<{className?: string}>;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode, matching the old accordion's filter. */
  districtsOnly?: boolean;
};

/** The single registry of sidebar panels, shared by Draw and Super Draw (the
 * modes gate density inside sections, not layout). The mobile tab view derives
 * its panel list from this too (see DataPanelUtils). */
export const SECTIONS: SidebarSection[] = [
  {
    key: 'population',
    label: 'District overview',
    description: 'Population, district notes, deviation',
    icon: Component1Icon,
    content: <PopulationPanel />,
    districtsOnly: true,
  },
  {
    key: 'demography',
    label: 'Demographics',
    description: 'Demographic tables and map layers',
    icon: PersonIcon,
    content: (
      <TabbedSummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        tabs={[
          {value: 'evaluation', label: 'Table'},
          {value: 'map', label: 'Map Layer'},
        ]}
        mapGroup={SUMMARY_TYPES.TOTPOP}
        withCoalition
      />
    ),
  },
  {
    key: 'election',
    label: 'Elections',
    description: 'Prior election data tables and map layers',
    icon: PieChartIcon,
    content: (
      <TabbedSummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        tabs={[
          {value: 'evaluation', label: 'Table'},
          {value: 'map', label: 'Map Layer'},
        ]}
        mapGroup={SUMMARY_TYPES.VOTERHISTORY}
      />
    ),
    districtsOnly: true,
  },
  {
    key: 'mapValidation',
    label: 'Validity check',
    description: 'Contiguity and completeness',
    icon: CheckCircledIcon,
    content: <MapValidation />,
    districtsOnly: true,
  },
  {
    key: 'overlays',
    label: 'Boundaries and areas',
    description: 'Boundaries and areas',
    icon: LayersIcon,
    content: <OverlaysPanel />,
  },
];

const AccordionSection: React.FC<{
  section: SidebarSection;
  open: boolean;
  onToggle: () => void;
}> = ({section, open, onToggle}) => {
  const Icon = section.icon;
  return (
    <div
      className="border border-gray-300 rounded-lg bg-white"
      data-testid={`data-panel-${section.key}`}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full cursor-pointer text-left p-3 rounded-lg transition-colors hover:bg-blue-50"
      >
        <Flex gap="2" align="center">
          <Icon className="shrink-0" />
          <Flex direction="column" className="flex-grow">
            <Text as="div" size="2" weight="bold">
              {section.label}
            </Text>
            <Text as="div" size="1" color="gray">
              {section.description}
            </Text>
          </Flex>
          <ChevronDownIcon
            className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </Flex>
      </button>
      <AnimatedCollapse open={open}>
        <div className="px-3 pb-3">{section.content}</div>
      </AnimatedCollapse>
    </div>
  );
};

export const DataCards: React.FC = () => {
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
    <Flex direction="column" gap="2" data-testid="data-panels">
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
