import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Button, Flex, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useState, Dispatch, SetStateAction} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Feature, Polygon} from 'geojson';

interface ZoomToFeatureProps {
  selectedIndex: number | null;
  setSelectedIndex: (index: number) => void | Dispatch<SetStateAction<number | null>>;
  features: GeoJSON.Feature[] | GeoJSON.Polygon[];
  padding?: number;
}

export default function ZoomToFeature({
  selectedIndex,
  setSelectedIndex,
  features,
  padding,
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
    const fitOptions = padding ? {padding} : undefined;
    if (isFeature(feature) && feature.properties?.bbox) {
      mapRef?.fitBounds(feature.properties.bbox, fitOptions);
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
      let SW = {lng: feature.coordinates[0][0][0], lat: feature.coordinates[0][0][1]};
      let NE = {lng: feature.coordinates[0][2][0], lat: feature.coordinates[0][2][1]};
      mapRef?.fitBounds([SW, NE], fitOptions);
      return;
    }

    console.error('Invalid feature type');
  };

  useEffect(() => {
    zoomToFeature(selectedIndex);
  }, [selectedIndex]);

  const selectFeature = (index: number) => {
    // Allow re-zooming to the currently selected feature: setSelectedIndex is a
    // no-op when the index is unchanged, so zoom explicitly.
    if (index === selectedIndex) {
      zoomToFeature(index);
    } else {
      setSelectedIndex(index);
    }
  };

  if (!features.length) return null;

  return (
    <Flex direction="column" gap="2">
      {/* Few areas: pick directly with buttons; many: a dropdown. */}
      {features.length < 10 ? (
        <Flex direction="row" gap="1" wrap="wrap">
          {features.map((_, index) => (
            <Button
              key={index}
              size="1"
              variant={index === selectedIndex ? 'solid' : 'outline'}
              onClick={() => selectFeature(index)}
              className="cursor-pointer"
            >
              {index + 1}
            </Button>
          ))}
        </Flex>
      ) : (
        <Select.Root value={`${selectedIndex || 0}`}>
          <Select.Trigger />
          <Select.Content>
            {features.map((_, index) => (
              <Select.Item key={index} value={`${index}`} onMouseDown={() => selectFeature(index)}>
                {index + 1}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      )}
      {features.length > 1 && (
        <Flex direction="row" gap="2">
          <Button
            size="1"
            variant="outline"
            onClick={() => changeSelectedIndex(-1)}
            disabled={!selectedIndex || selectedIndex === 0}
            className="cursor-pointer"
          >
            <ChevronLeftIcon /> Previous
          </Button>
          <Button
            size="1"
            variant="outline"
            onClick={() => changeSelectedIndex(1)}
            disabled={selectedIndex === features.length - 1}
            className="cursor-pointer"
          >
            Next <ChevronRightIcon />
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
