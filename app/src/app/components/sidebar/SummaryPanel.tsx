import {Blockquote, Flex, Heading, Select, Text} from '@radix-ui/themes';
import Evaluation from './Evaluation/Evaluation';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useEffect, useState} from 'react';
import {SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {summaryStatLabels} from '@/app/store/demography/evaluationConfig';
import {MapPanel} from './MapPanel';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {sortCommunitiesByRenderOrder} from '@/app/utils/communities';

type SummaryPanelProps = {
  defaultColumnSet: keyof SummaryStatConfig;
  displayedColumnSets: Array<keyof SummaryStatConfig>;
};
export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  defaultColumnSet,
  displayedColumnSets,
}) => {
  const availableSummaries = useDemographyStore(state => state.availableColumnSets.evaluation);
  const availableColumnSets = Object.keys(availableSummaries) as Array<keyof SummaryStatConfig>;
  const displayedStatLabels = summaryStatLabels.filter(f => displayedColumnSets.includes(f.value));
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

  const columnConfig = summaryType ? availableSummaries[summaryType] : [];
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

  if (
    !availableColumnSets?.length ||
    !summaryType ||
    !columnConfig ||
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
      <Flex direction="row" gap="4" align="center" wrap="wrap">
        {displayedStatLabels.length > 1 && (
          <>
            <Text>Summary type</Text>
            <Select.Root
              value={summaryType}
              onValueChange={value => setSummaryType(value as keyof SummaryStatConfig)}
            >
              <Select.Trigger />
              <Select.Content>
                {displayedStatLabels.map(({value, label}) => (
                  <Select.Item key={value} value={value}>
                    {label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </>
        )}
        {isCommunityMode && orderedCommunities.length > 0 && (
          <>
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
          </>
        )}
      </Flex>
      <Evaluation
        summaryType={summaryType}
        setSummaryType={setSummaryType}
        columnConfig={columnConfig}
        displayedColumnSets={displayedColumnSets}
        singleZone={isCommunityMode && orderedCommunities.length > 0 ? selectedZone : undefined}
        universeTotals={
          isCommunityMode && orderedCommunities.length > 0
            ? demographyService.universeTotals
            : undefined
        }
      />
      <Heading as="h3" size="3">
        Map
      </Heading>
      <MapPanel columnGroup={summaryType} displayedColumnSets={displayedColumnSets} />
    </Flex>
  );
};
