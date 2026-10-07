import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Button, Flex, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useRef, useState, Dispatch, SetStateAction} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Feature, Polygon} from 'geojson';
import type {LngLatBoundsLike} from 'maplibre-gl';
import {zoomToBounds} from '@/app/utils/map/fitBounds';

interface ZoomToFeatureProps {
  selectedIndex: number | null;
  setSelectedIndex: (index: number) => void | Dispatch<SetStateAction<number | null>>;
  features: Array<GeoJSON.Feature | GeoJSON.Polygon>;
  padding?: number;
  /** Optional display labels per feature; falls back to 1-based numbering. */
  labels?: string[];
}

export default function ZoomToFeature({
  selectedIndex,
  setSelectedIndex,
  features,
  padding,
  labels,
}: ZoomToFeatureProps) {
  const mapRef = useMapStore(state => state.getMapRef());
  const mapDocument = useMapStore(state => state.mapDocument);
  // Cancels the in-flight zoom's pending fly (idle listener + dwell timer);
  // called when a new zoom starts — or the component unmounts — so a stale
  // handler can't yank the camera later.
  const cancelPendingFly = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cancelPendingFly.current?.();
      cancelPendingFly.current = null;
    };
  }, []);

  // on repeat visit, prevent zooming to bounds on first render
  const [hasMounted, setHasMounted] = useState(false);

  // fires on first layout render
  // after useEffect in component lifecycle
  useLayoutEffect(() => {
    setHasMounted(true);
  }, []);

  function isFeature(feature: any): feature is Feature {
    return feature && typeof feature === 'object' && feature.type === 'Feature';
  }

  const nextIndex = selectedIndex === null ? 0 : selectedIndex + 1;
  const prevIndex = selectedIndex === null ? null : selectedIndex - 1;

  function isPolygon(feature: any): feature is Polygon {
    return feature && typeof feature === 'object' && feature.type === 'Polygon';
  }

  const getFeatureBounds = (feature: Feature | Polygon): LngLatBoundsLike | null => {
    if (isFeature(feature) && feature.properties?.bbox) {
      return feature.properties.bbox;
    }
    // Assumes the Polygon is a bbox ring à la PostGIS `ST_Envelope`:
    // ((MINX, MINY), (MAXX, MINY), (MAXX, MAXY), (MINX, MAXY), (MINX, MINY)),
    // so corners 0 and 2 are SW/NE. An arbitrary polygon won't work here.
    const polygon = isPolygon(feature)
      ? feature
      : isFeature(feature) && isPolygon(feature.geometry)
        ? feature.geometry
        : null;
    if (polygon) {
      return [
        {lng: polygon.coordinates[0][0][0], lat: polygon.coordinates[0][0][1]},
        {lng: polygon.coordinates[0][2][0], lat: polygon.coordinates[0][2][1]},
      ];
    }
    return null;
  };

  const zoomToFeature = (selectedIndex: number | null) => {
    let feature;
    if (selectedIndex !== null && hasMounted) {
      feature = features[selectedIndex];
    } else {
      return;
    }
    cancelPendingFly.current?.();
    cancelPendingFly.current = null;
    const bounds = getFeatureBounds(feature);
    if (!bounds) {
      console.error('Invalid feature type');
      return;
    }
    const geoIds = isFeature(feature) ? feature.properties?.geo_ids : undefined;
    if (!mapRef) return;
    cancelPendingFly.current = zoomToBounds(mapRef, mapDocument, {bounds, geoIds, padding});
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
              {labels?.[index] ?? index + 1}
            </Button>
          ))}
        </Flex>
      ) : (
        <Select.Root value={`${selectedIndex || 0}`}>
          <Select.Trigger />
          <Select.Content>
            {features.map((_, index) => (
              <Select.Item key={index} value={`${index}`} onMouseDown={() => selectFeature(index)}>
                {labels?.[index] ?? index + 1}
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
            onClick={() => prevIndex !== null && prevIndex >= 0 && setSelectedIndex(prevIndex)}
            disabled={prevIndex === null || prevIndex < 0}
            className="cursor-pointer"
          >
            <ChevronLeftIcon /> Previous
          </Button>
          <Button
            size="1"
            variant="solid"
            onClick={() => nextIndex < features.length && setSelectedIndex(nextIndex)}
            disabled={nextIndex >= features.length}
            className="cursor-pointer"
          >
            Next <ChevronRightIcon />
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
