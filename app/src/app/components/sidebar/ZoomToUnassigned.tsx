import {useMapStore} from '@/app/store/mapStore';
import {useUnassignFeaturesStore} from '@/app/store/unassignedFeatures';
import { useSummaryStats } from '@/app/utils/demography/demographyCache';
import {formatNumber} from '@/app/utils/numbers';
import {ChevronLeftIcon, ChevronRightIcon, ReloadIcon} from '@radix-ui/react-icons';
import {Button, Flex, Heading, IconButton, Select, Text, Tooltip} from '@radix-ui/themes';
import React, {useEffect, useLayoutEffect, useRef} from 'react';

export const ZoomToUnassigned = () => {
  const {
    updateUnassignedFeatures,
    selectedIndex,
    setSelectedIndex,
    changeSelectedIndex,
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
  // on repeat visit, prevent zooming to bounds on first render
  const [hasMounted, setHasMounted] = React.useState(false);
  
  useEffect(() => {
    if (selectedIndex !== null && hasMounted) {
      const feature = unassignedFeatureBboxes[selectedIndex];
      feature.properties?.bbox && mapRef?.fitBounds(feature.properties.bbox);
    }
  }, [selectedIndex]);

  // fires on first layout render
  // after useEffect in component lifecycle
  useLayoutEffect(() => {
    setHasMounted(true);
  }, []);

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
      <Heading as="h3" size="3">
        Unassigned areas
      </Heading>
      {unassigned !== undefined && <InfoText
        unassigned={unassigned}
        hasFoundUnassigned={hasFoundUnassigned}
        numFeatures={unassignedFeatureBboxes.length}
      />}
      {unassignedFeatureBboxes.length > 1 && (
        <Flex
          direction="row"
          align={'center'}
          gapX="2"
          gapY="2"
          wrap="wrap"
          justify={{
            initial: 'center',
            xl: 'start',
          }}
        >
          <div>
            <IconButton
              variant="outline"
              onClick={() => changeSelectedIndex(-1)}
              disabled={!selectedIndex || selectedIndex === 0}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Select.Root
              value={`${selectedIndex || 0}`}
              onValueChange={value => setSelectedIndex(parseInt(value))}
            >
              <Select.Trigger mx="2" />
              <Select.Content>
                {unassignedFeatureBboxes.map((feature, index) => (
                  <Select.Item key={index} value={`${index}`}>
                    {index + 1}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>

            <IconButton
              variant="outline"
              onClick={() => changeSelectedIndex(1)}
              disabled={selectedIndex === unassignedFeatureBboxes.length - 1}
            >
              <ChevronRightIcon />
            </IconButton>
          </div>
        </Flex>
      )}
      <Flex direction={'row'} gap="4" align="center" my="2">
        {unassignedOverallBbox && (
          <Button onClick={fitToOverallBounds} variant="surface" className="block">
            {`Show ${unassignedFeatureBboxes.length === 1 ? 'unassigned area' : 'all unassigned areas'}`}
          </Button>
        )}
        <Tooltip content={`Last update ${lastUpdated}`}>
          <Button onClick={updateUnassignedFeatures} variant="outline" className="block text-wrap">
            <ReloadIcon /> Refresh
          </Button>
        </Tooltip>
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
