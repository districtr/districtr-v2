import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {Box, Button, Flex, Heading, Text} from '@radix-ui/themes';
import { LngLatBoundsLike } from 'maplibre-gl';
import React, {useEffect} from 'react';

export const ZoomToUnassigned = () => {
  const [unassignedFeatures, setUnassignedFeatures] = React.useState<GeoJSON.Feature[]>([]);
  const mapRef = useMapStore(state => state.getMapRef());
  const zoneAssignments = useMapStore(state => state.zoneAssignments);

  const updateUnassignedFeatures = () => {
    if (!GeometryWorker || !mapRef) return;
    GeometryWorker.updateProps(Array.from(zoneAssignments.entries())).then(() =>
      GeometryWorker!.getUnassignedGeometries().then(geometries => {
        const {overall, dissolved} = geometries;
        mapRef?.fitBounds(overall as LngLatBoundsLike);
        if (dissolved.features.length) {
          setUnassignedFeatures(dissolved.features);
        } else {
          setUnassignedFeatures([]);
        }
      })
    );
  };
  useEffect(() => {
    updateUnassignedFeatures();
  }, []);

  return (
    <div>
      {unassignedFeatures.length > 0 && (
        <Box>
          <Heading as="h3" size="3" mt="2">
            Found {unassignedFeatures.length} unassigned area
            {unassignedFeatures.length > 1 ? 's' : ''}
          </Heading>
          <Text>Zoom to unassigned area{unassignedFeatures.length > 1 ? 's' : ''}</Text>
          <Flex direction="row" align={'center'} gapX="2" gapY="2" my="2" wrap="wrap">
            {unassignedFeatures.map((feature, index) => (
              <Button
                key={index}
                variant="surface"
                color="ruby"
                className="btn p-4"
                onClick={() => {
                  feature.properties?.bbox && mapRef?.fitBounds(feature.properties.bbox);
                }}
              >
                {index + 1}
              </Button>
            ))}
          </Flex>
        </Box>
      )}
    </div>
  );
};
