'use client';
import {Box, Button, Card, Flex, Heading, IconButton, Popover, Text} from '@radix-ui/themes';
import React, {useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {
  ArrowLeftIcon,
  BarChartIcon,
  BorderNoneIcon,
  CaretDownIcon,
  CheckIcon,
  ColorWheelIcon,
  Cross2Icon,
  GlobeIcon,
  GridIcon,
  LayersIcon,
  PlusIcon,
  TableIcon,
} from '@radix-ui/react-icons';
import PopulationPanel from './PopulationPanel';
import OverlaysPanel from './OverlaysPanel';
import {Contiguity} from './MapValidation/Contiguity';
import {ZoomToUnassigned} from './MapValidation/ZoomToUnassigned';
import {SummaryPanel} from './SummaryPanel';
import {useMapControlsStore} from '@store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';
import {SUMMARY_TYPES} from '@constants/demography/summary';

type FeatureCard = {
  label: string;
  description: string;
  icon: React.ComponentType<{className?: string}>;
  content: React.ReactNode;
  /** Hidden in communities (COI) mode, matching the accordion's panel filter. */
  districtsOnly?: boolean;
};

/**
 * The feature-card registry shared by Draw and Super Draw. Rendered in a
 * two-wide grid, so the order pairs rows: tables together, maps together.
 */
const FEATURE_CARDS = {
  population: {
    label: 'Population chart',
    description: 'Population by district, deviation, and unassigned people',
    icon: BarChartIcon,
    content: <PopulationPanel />,
    districtsOnly: true,
  },
  coalitionBuilder: {
    label: 'Coalition builder',
    description: 'Combine demographic groups into a coalition',
    icon: ColorWheelIcon,
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        sections={['coalition']}
      />
    ),
  },
  demographyTable: {
    label: 'Demographics table',
    description: 'Race and population data by district',
    icon: TableIcon,
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        sections={['evaluation']}
      />
    ),
  },
  voterHistoryTable: {
    label: 'Election results table',
    description: 'Past election results by district',
    icon: TableIcon,
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        sections={['evaluation']}
      />
    ),
    districtsOnly: true,
  },
  demographyMap: {
    label: 'Demographics map',
    description: 'Color the map by population and race',
    icon: GlobeIcon,
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
        sections={['map']}
      />
    ),
  },
  voterHistoryMap: {
    label: 'Election results map',
    description: 'Color the map by past election results',
    icon: GlobeIcon,
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
        sections={['map']}
      />
    ),
    districtsOnly: true,
  },
  contiguityCheck: {
    label: 'Contiguity check',
    description: 'Find districts drawn in disconnected pieces',
    icon: GridIcon,
    content: <Contiguity />,
    districtsOnly: true,
  },
  unassignedUnitCheck: {
    label: 'Find unassigned areas',
    description: 'Zoom to places not yet assigned to a district',
    icon: BorderNoneIcon,
    content: <ZoomToUnassigned />,
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
  <div className="grid grid-cols-2 gap-2">
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

// Drill-in slides forward (grid exits left, module enters from the right);
// going back reverses the motion.
const viewTransition = {duration: 0.18, ease: 'easeOut'} as const;

export const DataCards: React.FC = () => {
  const [currCard, setCurrCard] = useState<CardKey | null>(null);
  const visibleCards = useVisibleCards();
  // Self-heals if the map mode changes while a now-hidden card is open.
  const active = visibleCards.find(([key]) => key === currCard)?.[1];

  return (
    <Box data-testid="data-panels" className="overflow-x-clip">
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
  );
};

/**
 * Super Draw's sidebar: a persistent dropdown of the same feature cards.
 * Selected features stack in the scroll area below, each dismissible via a
 * close button in its top-right corner.
 */
export const SuperDrawCards: React.FC = () => {
  const [openCards, setOpenCards] = useState<CardKey[]>(['population']);
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
      <AnimatePresence initial={false}>
        {shownCards.map(key => {
          const card = FEATURE_CARDS[key];
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
