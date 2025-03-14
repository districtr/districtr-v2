import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapStore} from '@/app/store/mapStore';
import {useUnassignFeaturesStore} from '@/app/store/unassignedFeatures';
import {formatNumber} from '@/app/utils/numbers';
import {Button, Flex, Text} from '@radix-ui/themes';
import React, {useEffect, useRef} from 'react';
import {RefreshButton, TimestampDisplay} from '../../Time/TimestampDisplay';
import ZoomToFeature from './ZoomToFeature';

export const ZoomToUnassigned = () => {
  const {
    updateUnassignedFeatures,
    selectedIndex,
    setSelectedIndex,
    unassignedFeatureBboxes,
    hasFoundUnassigned,
    unassignedOverallBbox,
    reset,
    lastUpdated,
  } = useUnassignFeaturesStore(state => state);
  const mapRef = useMapStore(state => state.getMapRef());
  const mapDocument = useMapStore(state => state.mapDocument);
  const {summaryStats} = useSummaryStats();
  // prevent duplicate requests to get unassigned features
  const initialMapDocument = useRef(mapDocument);
  const unassigned = summaryStats?.unassigned;

  const fitToOverallBounds = () =>
    unassignedOverallBbox && mapRef?.fitBounds(unassignedOverallBbox);

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

  return (
    <Flex direction="column">
      {unassigned !== undefined && (
        <InfoText
          unassigned={unassigned}
          hasFoundUnassigned={hasFoundUnassigned}
          numFeatures={unassignedFeatureBboxes.length}
        />
      )}
      <Flex direction="row" align="center" gapX="2" gapY="2" wrap="wrap" justify="start" pt="2">
        <ZoomToFeature
          features={unassignedFeatureBboxes}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
        />
        <Button onClick={fitToOverallBounds} variant="surface" className="block">
          {`Show ${unassignedFeatureBboxes.length === 1 ? 'unassigned area' : 'all unassigned areas'}`}
        </Button>
      </Flex>
      <Flex direction="row" gapX="4" pt="4" align="center">
        <RefreshButton onClick={updateUnassignedFeatures} />
        <TimestampDisplay timestamp={lastUpdated} />
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
    return <Text my="1">Loading...</Text>;
  }
  if (hasFoundUnassigned && !numFeatures) {
    <Text my="1">No unassigned areas found.</Text>;
  }
  const isPlural = numFeatures > 1 || numFeatures === 0;
  return (
    <Text my="1">
      There {isPlural ? 'are' : 'is'} <b>{numFeatures}</b> unassigned area
      {isPlural ? 's' : ''}.&nbsp;{' '}
      {unassigned > 0 && (
        <>
          <b>{formatNumber(unassigned, 'string')}</b> population are not yet assigned.
        </>
      )}
    </Text>
  );
};
