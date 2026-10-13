import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useUnassignFeaturesStore} from '@/app/store/unassignedFeatures';
import {useUnassignedFeatures} from '@/app/hooks/useUnassignedFeatures';
import {formatNumber} from '@/app/utils/numbers';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import React from 'react';
import ZoomToFeature from './ZoomToFeature';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ConditionalScrollArea} from '../ConditionalScrollArea';

export const ZoomToUnassigned = () => {
  const {selectedIndex, setSelectedIndex} = useUnassignFeaturesStore(state => state);
  const higlightUnassigned = useMapControlsStore(state => state.mapOptions.higlightUnassigned);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const {summaryStats} = useSummaryStats();
  const unassigned = summaryStats?.unassigned;

  // This panel is what runs the search; the validity section's preview
  // observes the same query (see useUnassignedFeatures).
  const {features: unassignedFeatureBboxes, isLoading} = useUnassignedFeatures();
  const hasFoundUnassigned = !isLoading;

  return (
    <Flex direction="column">
      {unassigned !== undefined && (
        <InfoText
          unassigned={unassigned}
          hasFoundUnassigned={hasFoundUnassigned}
          numFeatures={unassignedFeatureBboxes.length}
        />
      )}
      {/* Same map option as Visual settings' "Highlight unassigned areas". */}
      <Text as="label" size="2" mt="2" className="cursor-pointer">
        <Flex gap="2" align="center">
          <Checkbox
            checked={higlightUnassigned === true}
            onCheckedChange={() => setMapOptions({higlightUnassigned: !higlightUnassigned})}
          />
          Show unassigned areas on the map
        </Flex>
      </Text>
      {unassignedFeatureBboxes.length > 0 && (
        <Text size="1" color="gray" mt="2">
          Zoom to unassigned area
        </Text>
      )}
      {/* A map can have hundreds of unassigned areas — scroll the grid once
          it's more than a few rows of buttons. */}
      <ConditionalScrollArea
        shouldUseScrollableRows={unassignedFeatureBboxes.length > 20}
        maxHeight="40vh"
      >
        <Flex direction="row" align="center" gapX="2" gapY="2" wrap="wrap" justify="start" pt="2">
          <ZoomToFeature
            features={unassignedFeatureBboxes}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            padding={100}
            labels={unassignedFeatureBboxes.map(feature => {
              const n = feature.properties?.geo_ids?.length;
              return n ? `Area · ${n} unit${n === 1 ? '' : 's'}` : 'Area';
            })}
          />
        </Flex>
      </ConditionalScrollArea>
    </Flex>
  );
};

const InfoText: React.FC<{
  unassigned: number;
  hasFoundUnassigned: boolean;
  numFeatures: number;
}> = ({unassigned, hasFoundUnassigned, numFeatures}) => {
  if (!hasFoundUnassigned) {
    return (
      <Text size="2" my="1">
        Loading...
      </Text>
    );
  }
  if (hasFoundUnassigned && !numFeatures) {
    return (
      <Text size="2" my="1">
        No unassigned areas found.
      </Text>
    );
  }
  const isPlural = numFeatures > 1 || numFeatures === 0;
  return (
    <Text size="2" my="1">
      There {isPlural ? 'are' : 'is'} <b>{numFeatures}</b> unassigned area
      {isPlural ? 's' : ''}.&nbsp;{' '}
      {unassigned > 0 && (
        <>
          <b>{formatNumber(unassigned, NUMBER_FORMATS.STRING)}</b> population are not yet assigned.
        </>
      )}
    </Text>
  );
};
