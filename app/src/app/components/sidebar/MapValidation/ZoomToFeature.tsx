import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Box, IconButton, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useState, Dispatch, SetStateAction} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Feature, Polygon} from 'geojson';
import type {Map as MapLibreMap, PaddingOptions} from 'maplibre-gl';

/**
 * Clamp fitBounds padding to a quarter of each canvas dimension, so at least half the
 * canvas remains for the fitted bounds. Unclamped, a fixed padding can eat most of a
 * small canvas, forcing extreme zoom-outs or a no-op.
 */
export const getFitBoundsPadding = (
  map: MapLibreMap | null | undefined,
  desiredPadding: number
): PaddingOptions | number => {
  const canvas = map?.getCanvas();
  if (!canvas) return desiredPadding;
  const horizontal = Math.max(0, Math.min(desiredPadding, Math.floor(canvas.clientWidth / 4)));
  const vertical = Math.max(0, Math.min(desiredPadding, Math.floor(canvas.clientHeight / 4)));
  return {top: vertical, bottom: vertical, left: horizontal, right: horizontal};
};

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
    // Bboxes are centroid-derived, so a single-unit component collapses to a point and
    // would zoom to street level without the cap.
    // TODO: the cap also blocks legitimate street-level zooms; remove it once the points
    // parquets carry per-unit bbox/size columns.
    const fitOptions = {
      maxZoom: 10,
      ...(padding ? {padding: getFitBoundsPadding(mapRef, padding)} : {}),
    };
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
