import {Box, Button, Card, Flex, Heading, IconButton, Popover, Text} from '@radix-ui/themes';
import React, {useState} from 'react';
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
 * Draw mode's flat feature list: one card per module, shown one at a time,
 * instead of Super Draw's accordion of multi-section panels.
 */
const FEATURE_CARDS = {
  population: {
    label: 'Population chart',
    description: 'Population by district, deviation, and unassigned people',
    icon: BarChartIcon,
    content: <PopulationPanel />,
    districtsOnly: true,
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
        className={`cursor-pointer w-full text-left hover:bg-blue-50 ${selected ? 'bg-blue-50' : ''}`}
        data-testid={`data-panel-${cardKey}`}
        aria-pressed={selected}
      >
        <Flex gap="3" align="center">
          <Icon className="shrink-0" />
          <Box flexGrow="1">
            <Text as="div" size="2" weight="bold">
              {card.label}
            </Text>
            <Text as="div" size="1" color="gray">
              {card.description}
            </Text>
          </Box>
          {selected && <CheckIcon className="shrink-0 text-blue-700" />}
        </Flex>
      </button>
    </Card>
  );
};

const useVisibleCards = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  return (Object.entries(FEATURE_CARDS) as Array<[CardKey, FeatureCard]>).filter(
    ([, card]) => mapMode !== MAP_MODES.COI || !card.districtsOnly
  );
};

export const DataCards: React.FC = () => {
  const [currCard, setCurrCard] = useState<CardKey | null>(null);
  const visibleCards = useVisibleCards();
  // Self-heals if the map mode changes while a now-hidden card is open.
  const active = visibleCards.find(([key]) => key === currCard)?.[1];

  if (active) {
    return (
      <Flex direction="column" gap="3" data-testid="data-panels">
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
    );
  }

  return (
    <Flex direction="column" gap="2" data-testid="data-panels">
      {visibleCards.map(([key, card]) => (
        <FeatureCardButton key={key} cardKey={key} card={card} onClick={() => setCurrCard(key)} />
      ))}
    </Flex>
  );
};

/**
 * Super Draw's sidebar: a persistent dropdown of the same feature cards.
 * Selected features stack in the scroll area below, each dismissible via a
 * close button in its top-right corner.
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
          <Flex direction="column" gap="2">
            {visibleCards.map(([key, card]) => (
              <FeatureCardButton
                key={key}
                cardKey={key}
                card={card}
                selected={shownCards.includes(key)}
                onClick={() => toggleCard(key)}
              />
            ))}
          </Flex>
        </Popover.Content>
      </Popover.Root>
      {shownCards.map(key => {
        const card = FEATURE_CARDS[key];
        return (
          <Box
            key={key}
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
          </Box>
        );
      })}
    </Flex>
  );
};
