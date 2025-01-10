import {useChartStore} from '@/app/store/chartStore';
import {useMapStore} from '@/app/store/mapStore';
import { useUnassignFeaturesStore } from '@/app/store/unassignedFeatures';
import {formatNumber} from '@/app/utils/numbers';
import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Box, Button, Flex, Heading, IconButton, Select, Text} from '@radix-ui/themes';
import React, {useEffect, useRef} from 'react';

export const ZoomToUnassigned = () => {
  const {
    updateUnassignedFeatures,
    selectedIndex,
    setSelectedIndex,
    unassignedFeatureBboxes,
    hasFoundUnassigned,
    unassignedOverallBbox,
    reset
  } = useUnassignFeaturesStore(state => state);
  const mapRef = useMapStore(state => state.getMapRef());
  const mapDocument = useMapStore(state => state.mapDocument);
  const initialMapDocument = useRef(mapDocument)
  const unassigned = useChartStore(state => state.chartInfo.unassigned);

  useEffect(() => {
    if (selectedIndex !== null) {
      const feature = unassignedFeatureBboxes[selectedIndex];
      feature.properties?.bbox && mapRef?.fitBounds(feature.properties.bbox);
    }
  }, [selectedIndex]);

  const fitToOverallBounds = () => unassignedOverallBbox && mapRef?.fitBounds(unassignedOverallBbox);

  useEffect(() => {
    console.log('updateUnassignedFeatures', unassignedFeatureBboxes.length, hasFoundUnassigned);
    if (!unassignedFeatureBboxes.length && !hasFoundUnassigned) {
      updateUnassignedFeatures();
    }
  }, []);

  useEffect(() => {
    if (initialMapDocument?.current?.document_id !== mapDocument?.document_id) {
      console.log("RESETTING")
      initialMapDocument.current = mapDocument;
      reset();
      setTimeout(() => {
        updateUnassignedFeatures();
      }, 3000);
    }
  }, [mapDocument?.document_id])

  return (
    <Flex direction="column">
      <Heading as="h3" size="3">
        Unassigned areas
      </Heading>
      {!hasFoundUnassigned && <Text>Loading...</Text>}
      {hasFoundUnassigned && !unassignedFeatureBboxes.length && <Text>No unassigned areas found.</Text>}
      {unassigned >= 0 ? (
        <Text>{formatNumber(unassigned, 'string')} population are not yet assigned.</Text>
      ) : null}
      {!!unassignedFeatureBboxes.length && (
        <Box>
          <Text mt="2">
            There {unassignedFeatureBboxes.length > 1 ? 'are' : 'is'} {unassignedFeatureBboxes.length}{' '}
            unassigned area
            {unassignedFeatureBboxes.length > 1 ? 's' : ''}.
          </Text>
          <Flex direction="row" align={'center'} gapX="2" gapY="2" my="2" wrap="wrap">
            {unassignedFeatureBboxes.length === 1 ? null : unassignedFeatureBboxes.length < 10 ? (
              <>
                {unassignedFeatureBboxes.map((feature, index) => (
                  <Button
                    key={index}
                    variant="surface"
                    className="btn p-4"
                    onClick={() => setSelectedIndex(index)}
                  >
                    {index + 1}
                  </Button>
                ))}
              </>
            ) : (
              <div>
                <IconButton
                  variant="outline"
                  onClick={() => setSelectedIndex((selectedIndex || 0) - 1)}
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
                  onClick={() => setSelectedIndex((selectedIndex || 0) + 1)}
                  disabled={selectedIndex === unassignedFeatureBboxes.length - 1}
                >
                  <ChevronRightIcon />
                </IconButton>
              </div>
            )}
          </Flex>
        </Box>
      )}

      {unassignedOverallBbox && (
        <Button onClick={fitToOverallBounds} variant="outline" mb="2" className="block">
          Zoom to {unassignedFeatureBboxes.length === 1 ? 'unassigned area' : 'all unassigned areas'}
        </Button>
      )}
    </Flex>
  );
};
