import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Button, Flex, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useRef, useState, Dispatch, SetStateAction} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Feature, Polygon} from 'geojson';
import type {LngLatBoundsLike, Map as MapLibreMap, PaddingOptions} from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';

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

/** Minimum hold at the general-area snap before the fly-in, so the orienting
 * pause is perceptible even when tiles are cached and 'idle' fires at once. */
const MIN_DWELL_MS = 400;

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

  // Fixed duration (speed-based scales with distance), tight padding (the
  // `padding` prop only frames the snap), and linear to avoid flyTo's
  // zoom-out-then-in swoop.
  const finalFitOptions = () => ({
    duration: 700,
    linear: true,
    padding: getFitBoundsPadding(mapRef, 40),
  });

  // After the snap, wait for both map idle (tiles loaded) and the minimum
  // dwell, then fly in. With geoIds, the fly targets the union bbox of the
  // geometries' rendered pieces — approxBounds is centroid-derived, so it
  // understates the true extent and collapses to a point for a single unit.
  // Without geoIds the fly targets approxBounds directly, waiting anyway so
  // both paths share the same pacing.
  const flyInAfterIdle = (approxBounds: LngLatBoundsLike, geoIds?: string[]) => {
    if (!mapRef) return;
    let idleDone = false;
    let dwellDone = false;
    let cancelled = false;
    const maybeFly = () => {
      if (cancelled || !idleDone || !dwellDone) return;
      cancelPendingFly.current = null;
      mapRef.fitBounds(
        (geoIds?.length && queryRenderedBounds(geoIds)) || approxBounds,
        finalFitOptions()
      );
    };
    const onIdle = () => {
      idleDone = true;
      maybeFly();
    };
    const dwellTimer = setTimeout(() => {
      dwellDone = true;
      maybeFly();
    }, MIN_DWELL_MS);
    cancelPendingFly.current = () => {
      cancelled = true;
      clearTimeout(dwellTimer);
      mapRef.off('idle', onIdle);
    };
    mapRef.once('idle', onIdle);
  };

  // Union bbox of the geometries' rendered tile pieces, or null if none are in
  // the loaded tiles (a feature can be split across tiles).
  const queryRenderedBounds = (geoIds: string[]): LngLatBoundsLike | null => {
    if (!mapRef) return null;
    const sourceLayers = [mapDocument?.parent_layer, mapDocument?.child_layer].filter(
      (l): l is string => !!l
    );
    const pieces = sourceLayers.flatMap(sourceLayer =>
      mapRef.querySourceFeatures(BLOCK_SOURCE_ID, {
        sourceLayer,
        filter: ['in', ['get', 'path'], ['literal', geoIds]],
      })
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const eat = (coords: any) => {
      if (typeof coords[0] === 'number') {
        if (coords[0] < minX) minX = coords[0];
        if (coords[0] > maxX) maxX = coords[0];
        if (coords[1] < minY) minY = coords[1];
        if (coords[1] > maxY) maxY = coords[1];
      } else {
        coords.forEach(eat);
      }
    };
    pieces.forEach(p => 'coordinates' in p.geometry && eat(p.geometry.coordinates));
    if (minX > maxX) return null;
    return [
      [minX, minY],
      [maxX, maxY],
    ];
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
    // Snap (no animation) to the general area, then fly in to the precise bounds.
    if (mapRef) {
      const camera = mapRef.cameraForBounds(bounds, {
        ...(padding ? {padding: getFitBoundsPadding(mapRef, padding)} : {}),
      });
      if (camera) {
        // Two levels out, not more: a bigger gap means a faster zoom rush
        // during the fly-in, which amplifies motion sickness.
        let snapZoom = Math.min((camera.zoom ?? 10) - 2, 10);
        // But never wider than the map document's own extent.
        if (mapDocument?.extent) {
          const extentZoom = mapRef.cameraForBounds(mapDocument.extent)?.zoom;
          if (extentZoom !== undefined) snapZoom = Math.max(snapZoom, extentZoom);
        }
        mapRef.jumpTo({
          center: camera.center,
          zoom: Math.max(0, snapZoom),
        });
      }
    }
    const geoIds = isFeature(feature) ? feature.properties?.geo_ids : undefined;
    flyInAfterIdle(bounds, geoIds);
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
