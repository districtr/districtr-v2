import {Box, Button, Card, Flex, Heading, Text} from '@radix-ui/themes';
import React, {useState} from 'react';
import {
  ArrowLeftIcon,
  BarChartIcon,
  BorderNoneIcon,
  ColorWheelIcon,
  GlobeIcon,
  GridIcon,
  LayersIcon,
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

export const DataCards: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const [currCard, setCurrCard] = useState<CardKey | null>(null);

  const visibleCards = (Object.entries(FEATURE_CARDS) as Array<[CardKey, FeatureCard]>).filter(
    ([, card]) => mapMode !== MAP_MODES.COI || !card.districtsOnly
  );
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
      {visibleCards.map(([key, card]) => {
        const Icon = card.icon;
        return (
          <Card key={key} asChild>
            <button
              onClick={() => setCurrCard(key)}
              className="cursor-pointer w-full text-left hover:bg-blue-50"
              data-testid={`data-panel-${key}`}
            >
              <Flex gap="3" align="center">
                <Icon className="shrink-0" />
                <Box>
                  <Text as="div" size="2" weight="bold">
                    {card.label}
                  </Text>
                  <Text as="div" size="1" color="gray">
                    {card.description}
                  </Text>
                </Box>
              </Flex>
            </button>
          </Card>
        );
      })}
    </Flex>
  );
};
