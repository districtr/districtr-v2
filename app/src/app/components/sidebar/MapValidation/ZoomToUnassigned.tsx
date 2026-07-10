import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useUnassignFeaturesStore} from '@/app/store/unassignedFeatures';
import {formatNumber} from '@/app/utils/numbers';
import {Checkbox, Flex, Text} from '@radix-ui/themes';
import React, {useEffect, useRef} from 'react';
import ZoomToFeature from './ZoomToFeature';
import {NUMBER_FORMATS} from '@constants/demography/format';

export const ZoomToUnassigned = () => {
  const {
    updateUnassignedFeatures,
    selectedIndex,
    setSelectedIndex,
    unassignedFeatureBboxes,
    hasFoundUnassigned,
    reset,
  } = useUnassignFeaturesStore(state => state);
  const mapDocument = useMapStore(state => state.mapDocument);
  const higlightUnassigned = useMapControlsStore(state => state.mapOptions.higlightUnassigned);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const {summaryStats} = useSummaryStats();
  // prevent duplicate requests to get unassigned features
  const initialMapDocument = useRef(mapDocument);
  const lastSavedAt = useRef(mapDocument?.updated_at);
  const unassigned = summaryStats?.unassigned;

  useEffect(() => {
    if (!unassignedFeatureBboxes.length && !hasFoundUnassigned) {
      updateUnassignedFeatures();
    }
  }, []);

  useEffect(() => {
    if (initialMapDocument?.current?.document_id !== mapDocument?.document_id) {
      initialMapDocument.current = mapDocument;
      reset();
      setTimeout(() => {
        updateUnassignedFeatures();
      }, 3000);
    }
  }, [mapDocument?.document_id]);

  // Auto-refresh after a save lands while this panel is open (updated_at moves
  // when assignments are persisted to the cloud).
  useEffect(() => {
    if (mapDocument?.updated_at && lastSavedAt.current !== mapDocument.updated_at) {
      lastSavedAt.current = mapDocument.updated_at;
      updateUnassignedFeatures();
    }
  }, [mapDocument?.updated_at]);

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
      <Flex direction="row" align="center" gapX="2" gapY="2" wrap="wrap" justify="start" pt="2">
        <ZoomToFeature
          features={unassignedFeatureBboxes}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          padding={240}
        />
      </Flex>
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
    <Text size="2" my="1">
      No unassigned areas found.
    </Text>;
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
