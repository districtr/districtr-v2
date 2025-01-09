import {useChartStore} from '@/app/store/chartStore';
import { idCache } from '@/app/store/idCache';
import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {formatNumber} from '@/app/utils/numbers';
import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Box, Button, Flex, Heading, IconButton, Select, Text} from '@radix-ui/themes';
import {LngLatBoundsLike} from 'maplibre-gl';
import React, {useEffect} from 'react';

export const ZoomToUnassigned = () => {
  const [unassignedFeatures, setUnassignedFeatures] = React.useState<GeoJSON.Feature[]>([]);
  const [overall, setOverall] = React.useState<LngLatBoundsLike | null>(null);
  const [hasFoundUnassigned, setHasFoundUnassigned] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const mapRef = useMapStore(state => state.getMapRef());
  const zoneAssignments = useMapStore(state => state.zoneAssignments);
  const chartInfo = useChartStore(state => state.chartInfo);
  const { unassigned, totPop } = chartInfo;
  const mapRenderingState = useMapStore(state => state.mapRenderingState);
  const shatterIds = useMapStore(state => state.shatterIds);
  const mapDocument = useMapStore(state => state.mapDocument);
  useEffect(() => {
    if (selectedIndex !== null) {
      const feature = unassignedFeatures[selectedIndex];
      feature.properties?.bbox && mapRef?.fitBounds(feature.properties.bbox);
    }
  }, [selectedIndex]);

  const fitToOverallBounds = () => overall && mapRef?.fitBounds(overall);
  const updateUnassignedFeatures = async () => {
    const allPopSeen = idCache.getTotalPopSeen(shatterIds.parents) === totPop
    if (!GeometryWorker || !mapRef) return;
    await GeometryWorker.updateProps(Array.from(zoneAssignments.entries()))
    const localGeometries = await GeometryWorker!.getUnassignedGeometries()
    if (!allPopSeen) {
      console.log("!!!Getting remote geos...")
      const remoteResponse = await fetch(`http://localhost:8000/api/unassigned/${mapDocument?.document_id}`)
      const remoteGeometries = await remoteResponse.json()
      console.log('!!!remoteGeometries', remoteGeometries)
    }
    setHasFoundUnassigned(true);
    const {overall, dissolved} = localGeometries;
    if (dissolved.features.length) {
      setOverall(overall as LngLatBoundsLike);
      setSelectedIndex(null);
      setUnassignedFeatures(dissolved.features);
    } else {
      setOverall(null);
      setUnassignedFeatures([]);
    }
  };

  useEffect(() => {
    updateUnassignedFeatures();
  }, [mapRenderingState, zoneAssignments]);

  return (
    <Flex direction="column">
      <Heading as="h3" size="3">
        Unassigned areas
      </Heading>
      {!hasFoundUnassigned && <Text>Loading...</Text>}
      {hasFoundUnassigned && !unassignedFeatures.length && <Text>No unassigned areas found.</Text>}
      {unassigned >= 0 ? (
        <Text>{formatNumber(unassigned, 'string')} population are not yet assigned.</Text>
      ) : null}
      {!!unassignedFeatures.length && (
        <Box>
          <Text mt="2">
            There {unassignedFeatures.length > 1 ? 'are' : 'is'} {unassignedFeatures.length}{' '}
            unassigned area
            {unassignedFeatures.length > 1 ? 's' : ''}.
          </Text>
          <Flex direction="row" align={'center'} gapX="2" gapY="2" my="2" wrap="wrap">
            {unassignedFeatures.length === 1 ? null : unassignedFeatures.length < 10 ? (
              <>
                {unassignedFeatures.map((feature, index) => (
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
                  onClick={() => setSelectedIndex(i => (i || 0) - 1)}
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
                    {unassignedFeatures.map((feature, index) => (
                      <Select.Item key={index} value={`${index}`}>
                        {index + 1}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>

                <IconButton
                  variant="outline"
                  onClick={() => setSelectedIndex(i => (i || 0) + 1)}
                  disabled={selectedIndex === unassignedFeatures.length - 1}
                >
                  <ChevronRightIcon />
                </IconButton>
              </div>
            )}
          </Flex>
        </Box>
      )}

      {overall && (
        <Button onClick={fitToOverallBounds} variant="outline" mb="2" className="block">
          Zoom to {unassignedFeatures.length === 1 ? 'unassigned area' : 'all unassigned areas'}
        </Button>
      )}
    </Flex>
  );
};
