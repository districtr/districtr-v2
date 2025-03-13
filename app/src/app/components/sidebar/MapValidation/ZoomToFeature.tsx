import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Box, IconButton, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useState, Dispatch, SetStateAction} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Feature, Polygon} from 'geojson';

interface ZoomToFeatureProps {
  selectedIndex: number | null;
  setSelectedIndex: (index: number) => void | Dispatch<SetStateAction<number | null>>;
  features: GeoJSON.Feature[] | GeoJSON.Polygon[];
}

export default function ZoomToFeature({
  selectedIndex,
  setSelectedIndex,
  features,
}: ZoomToFeatureProps) {
  const mapRef = useMapStore(state => state.getMapRef());

  // on repeat visit, prevent zooming to bounds on first render
  const [hasMounted, setHasMounted] = useState(false);

  // fires on first layout render
  // after useEffect in component lifecycle
  useLayoutEffect(() => {
    setHasMounted(true);
  }, []);

  const changeSelectedIndex = (amount: number) => {
    const prevIndex = selectedIndex || 0;
    const newIndex = prevIndex + amount;
    if (newIndex < 0 || newIndex >= features.length) return;
    setSelectedIndex(newIndex);
  };

  function isFeature(feature: any): feature is Feature {
    return feature && typeof feature === 'object' && feature.type === 'Feature';
  }

  function isPolygon(feature: any): feature is Polygon {
    return feature && typeof feature === 'object' && feature.type === 'Polygon';
  }

  const zoomToFeature = (selectedIndex: number | null) => {
    let feature;
    if (selectedIndex !== null && hasMounted) {
      feature = features[selectedIndex];
    } else {
      return;
    }
    if (isFeature(feature) && feature.properties?.bbox) {
      mapRef?.fitBounds(feature.properties.bbox);
      return;
    }

    // This is just assuming that the Polygon is the valid BBOX output from
    // `ST_Envelope` function in PostGIS, which:
    // ```
    // Returns the double-precision (float8) minimum bounding box for the supplied geometry, as a geometry.
    // The polygon is defined by the corner points of the bounding box
    // ((MINX, MINY), (MINX, MAXY), (MAXX, MAXY), (MAXX, MINY), (MINX, MINY)).
    // (PostGIS will add a ZMIN/ZMAX coordinate as well).
    // ```
    // If an arbitrary polygon is provided, this won't work.
    if (isPolygon(feature)) {
      let SE = {lng: feature.coordinates[0][0][0], lat: feature.coordinates[0][0][1]};
      let NW = {lng: feature.coordinates[0][2][0], lat: feature.coordinates[0][2][1]};
      mapRef?.fitBounds([SE, NW]);
      return;
    }

    console.error('Invalid feature type');
  };

  useEffect(() => {
    zoomToFeature(selectedIndex);
  }, [selectedIndex]);

  return (
    <div>
      {features.length > 1 && (
        <Box>
          <IconButton
            variant="outline"
            onClick={() => changeSelectedIndex(-1)}
            disabled={!selectedIndex || selectedIndex === 0}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Select.Root value={`${selectedIndex || 0}`}>
            <Select.Trigger mx="2" />
            <Select.Content>
              {features.map((_, index) => (
                <Select.Item
                  key={index}
                  value={`${index}`}
                  onMouseDown={() => {
                    // Allow re-zooming to currently selected feature
                    // The root level onValueChange event won't trigger if the same item is clicked
                    if (index === selectedIndex) {
                      zoomToFeature(index);
                    } else {
                      setSelectedIndex(index);
                    }
                  }}
                >
                  {index + 1}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          <IconButton
            variant="outline"
            onClick={() => changeSelectedIndex(1)}
            disabled={selectedIndex === features.length - 1}
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>
      )}
    </div>
  );
}
