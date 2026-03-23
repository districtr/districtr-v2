import {Blockquote, Button, Flex, Heading, Select, Text} from '@radix-ui/themes';
import Evaluation from './Evaluation/Evaluation';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useEffect, useState} from 'react';
import {SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {MapPanel} from './MapPanel';
import {
  COALITION_TOTAL_COLUMN_BY_UNIVERSE,
  COALITION_VARIABLE_BY_UNIVERSE,
  getCoalitionColumn,
  getCoalitionGroupLabel,
  getCoalitionLabel,
  getSelectedCoalitionColumns,
} from '@/app/utils/demography/coalition';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {CoalitionBuilder} from './CoalitionBuilder';
import {ChevronDownIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {sortCommunitiesByRenderOrder} from '@/app/utils/communities';

type SummaryPanelProps = {
  defaultColumnSet: keyof SummaryStatConfig;
  displayedColumnSets: Array<keyof SummaryStatConfig>;
};

type SectionKey = 'evaluation' | 'map' | 'coalition';

const SectionHeader: React.FC<{
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}> = ({title, isOpen, onToggle}) => {
  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      className="w-full justify-start pl-2 pr-1 text-black hover:text-black"
    >
      <Flex align="center" justify="between" width="100%">
        <Heading as="h3" size="3" className="text-black">
          {title}
        </Heading>
        <ChevronDownIcon className={isOpen ? 'text-black' : '-rotate-90 text-black'} />
      </Flex>
    </Button>
  );
};

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  defaultColumnSet,
  displayedColumnSets,
}) => {
  const availableSummaries = useDemographyStore(state => state.availableColumnSets.evaluation);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);
  const availableColumnSets = Object.keys(availableSummaries) as Array<keyof SummaryStatConfig>;
  const mapMode = useMapControlsStore(state => state.mapMode);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const communities = useMapStore(state => state.communities);

  const [summaryType, setSummaryType] = useState<keyof SummaryStatConfig | undefined>(
    !availableColumnSets.length
      ? undefined
      : availableColumnSets.includes(defaultColumnSet)
        ? defaultColumnSet
        : availableColumnSets[0]
  );
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    evaluation: true,
    map: defaultColumnSet === 'VOTERHISTORY' ? true : false,
    coalition: false,
  });
  const toggleSection = (section: SectionKey) => {
    setOpenSections(prev => ({...prev, [section]: !prev[section]}));
  };
  const canShowCoalition = summaryType === 'TOTPOP' || summaryType === 'VAP';

  const baseColumnConfig = summaryType ? availableSummaries[summaryType] : [];
  const columnConfigs: Array<{
    label: string;
    column: string;
    sourceCol?: string;
    tooltip?: string;
  }> = (() => {
    if (!summaryType || !baseColumnConfig) return [];
    if (summaryType !== 'TOTPOP' && summaryType !== 'VAP') return baseColumnConfig;
    const selectedColumns = getSelectedCoalitionColumns({
      selectedGroups: coalitionGroups,
      availableColumns: demographyCache.availableColumns,
      universe: summaryType,
    });
    if (!selectedColumns.length) return baseColumnConfig;
    const selectedColumnSet = new Set(selectedColumns);
    const coalitionLabels = coalitionGroups
      .filter(group => selectedColumnSet.has(getCoalitionColumn(group, summaryType)))
      .map(getCoalitionGroupLabel);
    return [
      {
        label: 'Coalition',
        tooltip:
          coalitionLabels.length > 0
            ? coalitionLabels.join(', ')
            : getCoalitionLabel({
                selectedGroups: coalitionGroups,
                availableColumns: demographyCache.availableColumns,
                universe: summaryType,
              }),
        sourceCol: COALITION_TOTAL_COLUMN_BY_UNIVERSE[summaryType],
        column: COALITION_VARIABLE_BY_UNIVERSE[summaryType],
      },
      ...baseColumnConfig,
    ];
  })();
  const isCommunityMode = mapMode === 'coi';
  const orderedCommunities = sortCommunitiesByRenderOrder(communities);

  useEffect(() => {
    if (!availableColumnSets.length) return;
    const hasCurrent = summaryType && availableSummaries[summaryType];
    if (!hasCurrent) {
      setSummaryType(
        availableColumnSets.includes(defaultColumnSet) ? defaultColumnSet : availableColumnSets[0]
      );
    }
  }, [availableSummaries]);

  useEffect(() => {
    if (canShowCoalition) return;
    setOpenSections(prev => ({...prev, coalition: false}));
  }, [canShowCoalition]);

  if (
    !availableColumnSets?.length ||
    !summaryType ||
    !columnConfigs.length ||
    displayedColumnSets.every(f => !availableSummaries[f])
  ) {
    return (
      <Blockquote color="crimson">
        <Text>Election statistics are not available for this map.</Text>
      </Blockquote>
    );
  }
  return (
    <Flex direction="column" gap="2">
      <SectionHeader
        title={summaryType === 'VOTERHISTORY' ? 'Voter History Table' : 'Demographic table'}
        isOpen={openSections.evaluation}
        onToggle={() => toggleSection('evaluation')}
      />
      {isCommunityMode && orderedCommunities.length > 0 && openSections.evaluation && (
        <Flex direction="row" gap="4" align="center" wrap="wrap" px="2">
          <Text>Community</Text>
          <Select.Root
            value={String(selectedZone)}
            onValueChange={value => setSelectedZone(Number(value))}
          >
            <Select.Trigger />
            <Select.Content>
              {orderedCommunities.map(community => (
                <Select.Item key={community.id} value={String(community.id)}>
                  {community.render_order_id}. {community.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
      )}
      {openSections.evaluation && (
        <Evaluation
          summaryType={summaryType}
          setSummaryType={setSummaryType}
          columnConfigs={columnConfigs}
          displayedColumnSets={displayedColumnSets}
          singleZone={isCommunityMode && orderedCommunities.length > 0 ? selectedZone : undefined}
          universeTotals={
            isCommunityMode && orderedCommunities.length > 0
              ? demographyCache.universeTotals
              : undefined
          }
        />
      )}
      <SectionHeader title="Map" isOpen={openSections.map} onToggle={() => toggleSection('map')} />
      {openSections.map && (
        <MapPanel columnGroup={summaryType} displayedColumnSets={displayedColumnSets} />
      )}
      {canShowCoalition && !isCommunityMode && (
        <>
          <SectionHeader
            title="Coalition Builder"
            isOpen={openSections.coalition}
            onToggle={() => toggleSection('coalition')}
          />
          {openSections.coalition && <CoalitionBuilder summaryType={summaryType} />}
        </>
      )}
    </Flex>
  );
};
