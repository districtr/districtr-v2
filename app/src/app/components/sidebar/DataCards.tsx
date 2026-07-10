'use client';
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Popover,
  SegmentedControl,
  Text,
} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {
  ArrowLeftIcon,
  BarChartIcon,
  BorderNoneIcon,
  CaretDownIcon,
  CheckIcon,
  ChevronDownIcon,
  Cross2Icon,
  GridIcon,
  LayersIcon,
  PersonIcon,
  PlusIcon,
} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {Contiguity} from './MapValidation/Contiguity';
import {ZoomToUnassigned} from './MapValidation/ZoomToUnassigned';
import {SummaryPanel, type SectionKey} from './SummaryPanel';
import {SaveButton} from '@components/Topbar/SaveButton';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useDemographyStore} from '@store/demography/demographyStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

/**
 * While a Map tab is active, the choropleth overlay is on with default
 * settings for that column group; leaving the tab (or unmounting, e.g. on a
 * mode switch) turns the overlay off.
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
 * table and map live in one card instead of two. */
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

type FeatureCard = {
  label: string;
  description: string;
  icon: React.ComponentType<{className?: string}>;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode, matching the accordion's panel filter. */
  districtsOnly?: boolean;
};

/**
 * The feature-card registry shared by Draw and Super Draw, rendered in a
 * two-wide grid. Population is not a card — it's pinned above the grid.
 */
const FEATURE_CARDS = {
  demographics: {
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
  elections: {
    label: 'Elections',
    description: 'Past election results by district, as a table or map',
    icon: BarChartIcon,
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
  contiguityCheck: {
    label: 'Contiguity check',
    description: 'Find districts drawn in disconnected pieces',
    icon: GridIcon,
    content: (
      <Flex direction="column" gap="2">
        <Box className="self-start">
          <SaveButton size="1" />
        </Box>
        <Contiguity />
      </Flex>
    ),
    districtsOnly: true,
  },
  unassignedUnitCheck: {
    label: 'Find unassigned areas',
    description: 'Zoom to places not yet assigned to a district',
    icon: BorderNoneIcon,
    content: (
      <Flex direction="column" gap="2">
        <Box className="self-start">
          <SaveButton size="1" />
        </Box>
        <ZoomToUnassigned />
      </Flex>
    ),
    districtsOnly: true,
  },
  overlays: {
    label: 'Overlay layers',
    description: 'County boundaries and reference layers',
    icon: LayersIcon,
    content: <OverlaysPanel />,
  },
} as const satisfies Record<string, FeatureCard>;

type CardKey = keyof typeof FEATURE_CARDS;

const FeatureCardButton: React.FC<{
  cardKey: CardKey;
  card: FeatureCard;
  onClick: () => void;
  /** Marks the panel as currently open (dropdown toggle state). */
  selected?: boolean;
}> = ({cardKey, card, onClick, selected}) => {
  const Icon = card.icon;
  return (
    <Card asChild>
      <button
        onClick={onClick}
        className={`cursor-pointer w-full h-full text-left transition-all duration-150 hover:bg-blue-50 hover:shadow-md hover:-translate-y-0.5 ${
          selected ? 'bg-blue-50' : ''
        }`}
        data-testid={`data-panel-${cardKey}`}
        aria-pressed={selected}
      >
        <Flex direction="column" gap="1" height="100%">
          <Flex gap="2" align="center">
            <Icon className="shrink-0" />
            <Text as="div" size="2" weight="bold" className="flex-grow">
              {card.label}
            </Text>
            {selected && <CheckIcon className="shrink-0 text-blue-700" />}
          </Flex>
          <Text as="div" size="1" color="gray">
            {card.description}
          </Text>
        </Flex>
      </button>
    </Card>
  );
};

/** The two-wide card grid shared by Draw mode and the Super Draw dropdown. */
const FeatureCardGrid: React.FC<{
  cards: Array<[CardKey, FeatureCard]>;
  onSelect: (key: CardKey) => void;
  selectedKeys?: CardKey[];
}> = ({cards, onSelect, selectedKeys}) => (
  // pt-1: headroom so the hover lift doesn't clip against the container edge.
  <div className="grid grid-cols-2 gap-2 pt-1">
    {cards.map(([key, card]) => (
      <FeatureCardButton
        key={key}
        cardKey={key}
        card={card}
        selected={selectedKeys?.includes(key)}
        onClick={() => onSelect(key)}
      />
    ))}
  </div>
);

const useVisibleCards = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  return (Object.entries(FEATURE_CARDS) as Array<[CardKey, FeatureCard]>).filter(
    ([, card]) => mapMode !== MAP_MODES.COI || !card.districtsOnly
  );
};

/**
 * The population chart, pinned above the feature cards in both modes so it's
 * always co-visible with whatever else is open. Collapsible, open by default.
 */
const PinnedPopulationPanel: React.FC = () => {
  const [open, setOpen] = useState(true);
  const mapMode = useMapControlsStore(state => state.mapMode);
  if (mapMode === MAP_MODES.COI) return null;
  return (
    <Box className="border border-gray-300 rounded-lg bg-white p-3" data-testid="pinned-population">
      <Flex justify="between" align="center">
        <Heading as="h3" size="3">
          Population
        </Heading>
        <IconButton
          variant="ghost"
          color="gray"
          className="cursor-pointer"
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Collapse population chart' : 'Expand population chart'}
        >
          <ChevronDownIcon
            className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </IconButton>
      </Flex>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{height: 0, opacity: 0}}
            animate={{height: 'auto', opacity: 1}}
            exit={{height: 0, opacity: 0}}
            transition={{duration: 0.2, ease: 'easeOut'}}
            className="overflow-hidden"
          >
            <Box pt="2">
              <PopulationPanel />
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
};

// Drill-in slides forward (grid exits left, module enters from the right);
// going back reverses the motion.
const viewTransition = {duration: 0.18, ease: 'easeOut'} as const;

export const DataCards: React.FC = () => {
  const [currCard, setCurrCard] = useState<CardKey | null>(null);
  const visibleCards = useVisibleCards();
  // Self-heals if the map mode changes while a now-hidden card is open.
  const active = visibleCards.find(([key]) => key === currCard)?.[1];

  return (
    <Flex direction="column" gap="3" data-testid="data-panels">
      <PinnedPopulationPanel />
      <Box className="overflow-x-clip">
        <AnimatePresence mode="wait" initial={false}>
          {active ? (
            <motion.div
              key={currCard}
              initial={{opacity: 0, x: 32}}
              animate={{opacity: 1, x: 0}}
              exit={{opacity: 0, x: 32}}
              transition={viewTransition}
            >
              <Flex direction="column" gap="3">
                <Button
                  variant="ghost"
                  onClick={() => setCurrCard(null)}
                  className="self-start cursor-pointer"
                >
                  <ArrowLeftIcon /> Back to features
                </Button>
                <Heading as="h3" size="3">
                  {active.label}
                </Heading>
                <Box>{active.content}</Box>
              </Flex>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{opacity: 0, x: -32}}
              animate={{opacity: 1, x: 0}}
              exit={{opacity: 0, x: -32}}
              transition={viewTransition}
            >
              <FeatureCardGrid cards={visibleCards} onSelect={setCurrCard} />
            </motion.div>
          )}
        </AnimatePresence>
      </Box>
    </Flex>
  );
};

/**
 * Super Draw's sidebar: the pinned population chart, then a persistent
 * dropdown of the same feature cards. Selected features stack below, each
 * dismissible via a close button in its top-right corner.
 */
export const SuperDrawCards: React.FC = () => {
  const [openCards, setOpenCards] = useState<CardKey[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleCards = useVisibleCards();

  // Drop cards hidden by a mode change (e.g. districts-only cards in COI).
  const shownCards = openCards.filter(key => visibleCards.some(([k]) => k === key));

  // The dropdown keeps open panels listed (checked) so they can be toggled
  // off from there too; it stays open for toggling several at once.
  const toggleCard = (key: CardKey) =>
    setOpenCards(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  const removeCard = (key: CardKey) => setOpenCards(prev => prev.filter(k => k !== key));

  return (
    <Flex direction="column" gap="3" data-testid="data-panels">
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger>
          <Button size="3" variant="surface" className="w-full cursor-pointer">
            <Flex align="center" justify="between" width="100%">
              <Flex align="center" gap="2">
                <PlusIcon />
                Add a panel
              </Flex>
              <CaretDownIcon />
            </Flex>
          </Button>
        </Popover.Trigger>
        <Popover.Content
          className="w-[var(--radix-popover-trigger-width)]"
          maxHeight="60vh"
          size="1"
        >
          <FeatureCardGrid cards={visibleCards} onSelect={toggleCard} selectedKeys={shownCards} />
        </Popover.Content>
      </Popover.Root>
      <PinnedPopulationPanel />
      <AnimatePresence initial={false}>
        {shownCards.map(key => {
          const card: FeatureCard = FEATURE_CARDS[key];
          return (
            <motion.div
              key={key}
              layout
              initial={{opacity: 0, y: -12, scale: 0.97}}
              animate={{opacity: 1, y: 0, scale: 1}}
              exit={{opacity: 0, scale: 0.97}}
              transition={{duration: 0.2, ease: 'easeOut'}}
              className="border border-gray-300 rounded-lg bg-white p-3"
              data-testid={`data-panel-${key}-open`}
            >
              <Flex justify="between" align="center" mb="2">
                <Heading as="h3" size="3">
                  {card.label}
                </Heading>
                <IconButton
                  variant="ghost"
                  color="gray"
                  className="cursor-pointer"
                  onClick={() => removeCard(key)}
                  aria-label={`Close ${card.label}`}
                >
                  <Cross2Icon />
                </IconButton>
              </Flex>
              {card.content}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Flex>
  );
};
