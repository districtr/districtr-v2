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
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {HelpTip} from '@components/InfoTip/HelpTip';
import type {HelpTipKey} from '@components/InfoTip/helpTipContent';

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
 * live in one accordion section instead of two. */
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
  description: string;
  icon: React.ComponentType<{className?: string}>;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode, matching the old accordion's filter. */
  districtsOnly?: boolean;
  /** Contextual HelpTip key shown next to the section's accordion header, if any. */
  helpTip?: HelpTipKey;
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
    helpTip: 'districtOverview',
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
        withCoalition
      />
    ),
    helpTip: 'demographics',
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
      />
    ),
    districtsOnly: true,
    helpTip: 'elections',
  },
  {
    key: 'mapValidation',
    label: 'Validity check',
    description: 'Contiguity and completeness',
    icon: CheckCircledIcon,
    content: <MapValidation />,
    districtsOnly: true,
    helpTip: 'mapValidation',
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
      className="relative border border-gray-300 rounded-lg bg-white"
      data-testid={`data-panel-${section.key}`}
    >
      {/* Exactly dev's original single-row layout (icon + the label/description column +
          chevron, all centered together as one group). A literal <button> can't legally
          contain HelpTip (its trigger, and the link inside its expanded content, are
          themselves interactive — invalid to nest inside a <button>), which is why
          earlier attempts pulled the description onto its own row outside the button,
          breaking the centering, or pinned the icon to a fixed corner instead of the
          text. A div with role="button" has the same semantics for our purposes but
          carries no such restriction, so the icon can sit inline right after the
          description, in the same row, without touching the original layout at all. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        className="w-full cursor-pointer text-left p-3 rounded-lg transition-colors hover:bg-blue-50"
      >
        <Flex gap="2" align="center">
          <Icon className="shrink-0" />
          <Flex direction="column" className="flex-grow">
            <Text as="div" size="2" weight="bold">
              {section.label}
            </Text>
            <Flex align="center" gap="1">
              <Text as="span" size="1" color="gray">
                {section.description}
              </Text>
              {section.helpTip && (
                // Stops the click from also toggling the card open/closed — HelpTip is
                // hover-triggered, but its "watch video"/guide links are still real
                // clicks that would otherwise bubble up to this row's own onClick.
                <span onClick={event => event.stopPropagation()}>
                  <HelpTip tip={section.helpTip} />
                </span>
              )}
            </Flex>
          </Flex>
          <ChevronDownIcon
            className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </Flex>
      </div>
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
