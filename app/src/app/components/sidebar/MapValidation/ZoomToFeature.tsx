import {ChevronLeftIcon, ChevronRightIcon} from '@radix-ui/react-icons';
import {Button, Flex, Select} from '@radix-ui/themes';
import {useEffect, useLayoutEffect, useRef, useState, Dispatch, SetStateAction} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Feature, Polygon} from 'geojson';
import type {
  LngLatBoundsLike,
  Map as MapLibreMap,
  MapSourceDataEvent,
  PaddingOptions,
} from 'maplibre-gl';
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

/** The move over to the target: eased at both ends, no hard cut, no pull-back. */
const PAN_DURATION_MS = 1500;

/** The zoom that follows for a single-unit target, once it has loaded. */
const ZOOM_DURATION_MS = 800;

/** Cap on those zoom moves. Measuring against loaded tiles converges in one or
 * two, but the loop must not be able to run away. */
const MAX_SETTLE_MOVES = 4;

/** Backstop for bounds with no area — a sliver, or a bbox that came through as
 * a point — which would otherwise frame at the map's own ceiling of 22. Real
 * geometry fits well inside this, so it doesn't cap ordinary targets. */
const MAX_ZOOM = 16;

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

  // Camera that frames `bounds` with room around it: generous padding and a
  // zoom cap, so a one-unit target doesn't fill the canvas at street level with
  // nothing around it to orient by.
  const cameraForFrame = (bounds: LngLatBoundsLike) =>
    mapRef?.cameraForBounds(bounds, {
      padding: getFitBoundsPadding(mapRef, padding ?? 80),
      maxZoom: MAX_ZOOM,
    });

  // Second motion, for a target whose bbox is a single unit's centroid — a
  // point, with no extent to frame. The pan takes the camera there at the zoom
  // it already had; once the unit's real geometry is in the loaded tiles we
  // know how far to zoom, and go. Both conditions have to hold, so whichever
  // lands last starts the zoom: the tiles usually arrive during the pan, making
  // it one continuous motion. Never re-aims the pan itself — interrupting an
  // ease from inside a map event is what made the camera stall mid-move.
  const zoomInAfterPan = (geoIds: string[]) => {
    if (!mapRef) return;
    let panDone = false;
    let moves = 0;
    const stop = () => {
      mapRef.off('moveend', onMoveEnd);
      mapRef.off('sourcedata', onSourceData);
      mapRef.off('idle', onIdle);
      cancelPendingFly.current = null;
    };
    // Measure the unit's rendered extent and ease to it. The measurement only
    // covers loaded tiles, which cover roughly the viewport — so a unit larger
    // than the screen comes back clipped, and easing to it lands short. Zooming
    // out loads more of it, so we measure again each time the map settles and
    // keep going until the framing we'd move to is the one we're already in.
    const tryZoom = () => {
      if (!panDone) return;
      if (moves >= MAX_SETTLE_MOVES) return stop();
      const rendered = queryRenderedBounds(geoIds);
      const camera = rendered && cameraForFrame(rendered);
      if (!camera) return;
      const zoom = camera.zoom ?? mapRef.getZoom();
      if (moves > 0 && Math.abs(zoom - mapRef.getZoom()) < 0.25) return; // settled
      moves++;
      // One shot per settle: further tiles arriving mid-ease would stack up
      // more of them. The next measurement happens on idle.
      mapRef.off('sourcedata', onSourceData);
      // Out of the map event that got us here: an ease started from inside one
      // runs while the outgoing animation's frame loop is still going, and that
      // loop truncates it — the taller the zoom delta, the shorter it lands.
      setTimeout(() => mapRef.easeTo({center: camera.center, zoom, duration: ZOOM_DURATION_MS}), 0);
    };
    const onMoveEnd = () => {
      mapRef.off('moveend', onMoveEnd);
      panDone = true;
      tryZoom();
    };
    const onSourceData = (e: MapSourceDataEvent) => {
      if (e.sourceId === BLOCK_SOURCE_ID) tryZoom();
    };
    // Idle means the camera is at rest and the tiles it wanted have arrived —
    // the moment to re-measure. If that produces no move, we're either framed
    // or the geometry is never going to render: either way, stop listening
    // rather than leave a handler armed to yank the camera during a later pan.
    const onIdle = () => {
      const before = moves;
      tryZoom();
      if (moves === before) stop();
    };
    mapRef.on('moveend', onMoveEnd);
    mapRef.on('sourcedata', onSourceData);
    mapRef.on('idle', onIdle);
    cancelPendingFly.current = stop;
  };

  // Union bbox of the geometries' rendered tile pieces, or null if none are in
  // the loaded tiles.
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
    if (!bounds || !mapRef) {
      if (!bounds) console.error('Invalid feature type');
      return;
    }
    // A multi-unit target's bbox has real extent, so its framing is settled up
    // front and one ease does the whole job. A single unit's bbox is just its
    // centroid, so unless the unit is already rendered (a nearby target, or a
    // repeat visit) we pan there at the current zoom and hand the zoom-in to
    // the second motion.
    const geoIds: string[] | undefined = isFeature(feature)
      ? feature.properties?.geo_ids
      : undefined;
    const singleUnit = geoIds?.length === 1;
    const rendered = singleUnit ? queryRenderedBounds(geoIds!) : null;
    const camera = cameraForFrame(rendered ?? bounds);
    if (!camera) return;
    // easeTo, not flyTo: flyTo always arcs, and the `minZoom` knob that would
    // flatten the arc also replaces its curve with rho = sqrt(wMax / u1 * 2),
    // which falls below 1 on a long path — the camera then races most of the way
    // and crawls the rest. easeTo just interpolates, so the pan holds one pace.
    const panOnly = singleUnit && !rendered;
    mapRef.easeTo({
      center: camera.center,
      ...(panOnly ? {} : {zoom: camera.zoom}),
      duration: PAN_DURATION_MS,
    });
    if (panOnly) zoomInAfterPan(geoIds!);
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
