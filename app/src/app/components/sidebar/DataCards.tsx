'use client';
import {Flex, SegmentedControl, Text} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {
  BarChartIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  LayersIcon,
  PersonIcon,
  PieChartIcon,
} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel, type SectionKey} from './SummaryPanel';
import {MapControlsStore, useMapControlsStore} from '@store/mapControlsStore';
import {useDemographyStore} from '@store/demography/demographyStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

/**
 * While a Map tab is active, the choropleth overlay is on with default
 * settings for that column group; leaving the tab or unmounting (collapsing
 * the section, switching modes) turns the overlay off.
 */
// Claim token: if another Map tab took over after this one, its enable wins
// and this one's cleanup must not turn the overlay off.
let mapPanelClaim = 0;
const useMapPanelLifecycle = (mapGroup: SummaryType | undefined) => {
  useEffect(() => {
    if (!mapGroup) return;
    const claim = ++mapPanelClaim;
    const demography = useDemographyStore.getState();
    const variables = demography.availableColumnSets.map[mapGroup] ?? [];
    // Default variable: the group's first entry, unless the current one
    // already belongs to this group.
    if (variables.length && !variables.some(v => v.value === demography.variable)) {
      demography.setVariable(variables[0].value);
    }
    useMapControlsStore
      .getState()
      .setMapOptions({demographicDisplayMode: DEMOGRAPHIC_MODES.OVERLAY});
    return () => {
      if (claim === mapPanelClaim) {
        useMapControlsStore.getState().setMapOptions({demographicDisplayMode: undefined});
      }
    };
  }, [mapGroup]);
};

/** Table / Map (/ Coalition) tabs over a single SummaryPanel section, so the
 * table and map live in one accordion section instead of two. */
const TabbedSummaryPanel: React.FC<{
  defaultColumnSet: SummaryType;
  displayedColumnSets: Array<SummaryType>;
  tabs: Array<{value: SectionKey; label: string}>;
  mapGroup: SummaryType;
}> = ({defaultColumnSet, displayedColumnSets, tabs, mapGroup}) => {
  const [tab, setTab] = useState<SectionKey>(tabs[0].value);
  useMapPanelLifecycle(tab === 'map' ? mapGroup : undefined);
  return (
    <Flex direction="column" gap="2">
      <SegmentedControl.Root size="1" value={tab} onValueChange={v => setTab(v as SectionKey)}>
        {tabs.map(t => (
          <SegmentedControl.Item key={t.value} value={t.value}>
            {t.label}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
      <SummaryPanel
        key={tab}
        defaultColumnSet={defaultColumnSet}
        displayedColumnSets={displayedColumnSets}
        sections={[tab]}
      />
    </Flex>
  );
};

type SidebarSectionKey = MapControlsStore['sidebarPanels'][number];

type SidebarSection = {
  key: SidebarSectionKey;
  label: string;
  description: string;
  icon: React.ComponentType<{className?: string}>;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode, matching the old accordion's filter. */
  districtsOnly?: boolean;
};

/** The old organization: one scrollable accordion of five sections, shared by
 * Draw and Super Draw (the modes gate density inside sections, not layout). */
const SECTIONS: SidebarSection[] = [
  {
    key: 'population',
    label: 'Population',
    description: 'Population by district, deviation, and unassigned people',
    icon: BarChartIcon,
    content: <PopulationPanel />,
    districtsOnly: true,
  },
  {
    key: 'demography',
    label: 'Demographics',
    description: 'Race and population tables, maps, and coalitions',
    icon: PersonIcon,
    content: (
      <TabbedSummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        tabs={[
          {value: 'evaluation', label: 'Table'},
          {value: 'map', label: 'Map'},
          {value: 'coalition', label: 'Coalition'},
        ]}
        mapGroup={SUMMARY_TYPES.TOTPOP}
      />
    ),
  },
  {
    key: 'election',
    label: 'Elections',
    description: 'Past election results by district, as a table or map',
    icon: PieChartIcon,
    content: (
      <TabbedSummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        tabs={[
          {value: 'evaluation', label: 'Table'},
          {value: 'map', label: 'Map'},
        ]}
        mapGroup={SUMMARY_TYPES.VOTERHISTORY}
      />
    ),
    districtsOnly: true,
  },
  {
    key: 'mapValidation',
    label: 'Validity check',
    description: 'Check contiguity and find unassigned areas',
    icon: CheckCircledIcon,
    content: <MapValidation />,
    districtsOnly: true,
  },
  {
    key: 'overlays',
    label: 'Overlays',
    description: 'County boundaries and reference layers',
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
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{height: 0, opacity: 0}}
            animate={{height: 'auto', opacity: 1}}
            exit={{height: 0, opacity: 0}}
            transition={{duration: 0.2, ease: 'easeOut'}}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{section.content}</div>
          </motion.div>
        )}
      </AnimatePresence>
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
