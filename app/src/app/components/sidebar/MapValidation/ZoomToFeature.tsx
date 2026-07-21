import {CheckIcon, ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
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
  // Pending 'idle' handler from a single-geometry zoom; cancelled when a new
  // zoom starts so a stale handler can't yank the camera later.
  const pendingIdleHandler = useRef<(() => void) | null>(null);

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

  // Areas already dealt with (e.g. assigned since the list was built) stay in the
  // list with a check instead of being renumbered away; navigation skips them.
  const isResolved = (feature: Feature | Polygon) =>
    isFeature(feature) && !!feature.properties?.resolved;

  const findUnresolved = (from: number, direction: 1 | -1): number | null => {
    for (let i = from; i >= 0 && i < features.length; i += direction) {
      if (!isResolved(features[i])) return i;
    }
    return null;
  };
  const nextIndex = findUnresolved(selectedIndex === null ? 0 : selectedIndex + 1, 1);
  const prevIndex = selectedIndex === null ? null : findUnresolved(selectedIndex - 1, -1);

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

  // Animated fit options shared by every final zoom, so all paths land the same way.
  // Fixed short duration (rather than speed-based, which scales with distance) and a
  // tight padding so the target fills the viewport; the wider `padding` prop only
  // frames the general-area snap. `linear` swaps flyTo's zoom-out-then-in swoop for a
  // straight ease — the swoop is what reads as motion sickness. (MapLibre already
  // skips animation entirely for users with OS-level reduced motion.)
  const finalFitOptions = () => ({
    duration: 700,
    linear: true,
    padding: getFitBoundsPadding(mapRef, 40),
  });

  // Pulse the target geometries' outlines a few times after arrival (via the
  // `zoomFlash` feature-state on the highlight layers) so tiny targets are
  // findable at a glance.
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulsedIds = useRef<string[]>([]);

  const setFlash = (on: boolean) => {
    const sourceLayers = [mapDocument?.parent_layer, mapDocument?.child_layer].filter(
      (l): l is string => !!l
    );
    pulsedIds.current.forEach(id =>
      sourceLayers.forEach(sourceLayer =>
        mapRef?.setFeatureState({source: BLOCK_SOURCE_ID, sourceLayer, id}, {zoomFlash: on})
      )
    );
  };

  const clearPulse = () => {
    if (pulseTimer.current) clearInterval(pulseTimer.current);
    pulseTimer.current = null;
    if (pulsedIds.current.length) setFlash(false);
    pulsedIds.current = [];
  };

  const pulseGeometries = (geoIds: string[]) => {
    clearPulse();
    pulsedIds.current = geoIds;
    setFlash(true);
    let ticks = 0;
    pulseTimer.current = setInterval(() => {
      ticks++;
      if (ticks >= 5) {
        clearPulse(); // three on-phases total, ending off
        return;
      }
      setFlash(ticks % 2 === 0);
    }, 300);
  };

  useEffect(() => clearPulse, []);

  // After the snap, wait for the map to go idle (tiles loaded), then fly in.
  // With geoIds, the map is queried for the geometries' rendered pieces and the
  // fly targets their union bbox — needed because unassigned-area bboxes are
  // centroid-derived: they understate the true extent, and a single-unit
  // component collapses to a point. Without geoIds the fly targets approxBounds
  // directly; waiting for idle anyway keeps the pacing identical to the
  // query path, so every zoom reads as snap → beat → fly.
  const flyInAfterIdle = (approxBounds: LngLatBoundsLike, geoIds?: string[]) => {
    if (!mapRef) return;
    const onIdle = () => {
      pendingIdleHandler.current = null;
      mapRef.fitBounds(
        (geoIds?.length && queryRenderedBounds(geoIds)) || approxBounds,
        finalFitOptions()
      );
      if (geoIds?.length) {
        mapRef.once('moveend', () => pulseGeometries(geoIds));
      }
    };
    pendingIdleHandler.current = onIdle;
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
    if (pendingIdleHandler.current) {
      mapRef?.off('idle', pendingIdleHandler.current);
      pendingIdleHandler.current = null;
    }
    clearPulse();
    const bounds = getFeatureBounds(feature);
    if (!bounds) {
      console.error('Invalid feature type');
      return;
    }
    // Consistent two-step for every feature: snap (no animation) to the general
    // area — centered on the target but a few zoom levels out — then fly in to
    // the precise bounds.
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
          {features.map((feature, index) => {
            const resolved = isResolved(feature);
            return (
              <Button
                key={index}
                size="1"
                color={resolved ? 'green' : undefined}
                variant={resolved ? 'soft' : index === selectedIndex ? 'solid' : 'outline'}
                disabled={resolved}
                onClick={() => selectFeature(index)}
                className="cursor-pointer"
              >
                {resolved && <CheckIcon />}
                {labels?.[index] ?? index + 1}
              </Button>
            );
          })}
        </Flex>
      ) : (
        <Select.Root value={`${selectedIndex || 0}`}>
          <Select.Trigger />
          <Select.Content>
            {features.map((feature, index) => (
              <Select.Item
                key={index}
                value={`${index}`}
                disabled={isResolved(feature)}
                onMouseDown={() => selectFeature(index)}
              >
                {isResolved(feature) ? '✓ ' : ''}
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
            onClick={() => prevIndex !== null && setSelectedIndex(prevIndex)}
            disabled={prevIndex === null}
            className="cursor-pointer"
          >
            <ChevronLeftIcon /> Previous
          </Button>
          {/* The core loop is "fix this one, go to the next" — Next is primary. */}
          <Button
            size="1"
            variant="solid"
            onClick={() => nextIndex !== null && setSelectedIndex(nextIndex)}
            disabled={nextIndex === null}
            className="cursor-pointer"
          >
            Next <ChevronRightIcon />
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
