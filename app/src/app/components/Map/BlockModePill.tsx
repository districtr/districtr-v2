'use client';
import React, {useEffect} from 'react';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {GEO_UNIT_SINGULAR_NAMES} from '@constants/document/geoUnits';
import {MapPill} from './MapPill';
import {type Bbox, padBbox, queryRenderedGeoIdBounds, widenBbox} from '@utils/map/fitBounds';

/**
 * Guides the break-into-blocks flow: prompts for a unit while the break tool
 * is armed, then (in block view) constrains the viewport to the captured
 * blocks and offers the exit. Escape exits block view, or disarms the break
 * tool before a unit is picked.
 */
export const BlockModePill = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const bounds = useMapControlsStore(state => state.mapOptions.bounds);
  const captiveIds = useMapStore(state => state.captiveIds);
  const focusedParentId = useMapStore(state => state.focusFeatures[0]?.id?.toString());
  const parentGeoUnitType = useMapStore(state => state.mapDocument?.parent_geo_unit_type);
  const unitName = (parentGeoUnitType && GEO_UNIT_SINGULAR_NAMES[parentGeoUnitType]) || 'precinct';
  const exitBlockView = useMapStore(state => state.exitBlockView);
  const getMapRef = useMapStore(state => state.getMapRef);
  const inBlockView = captiveIds.size > 0;

  // Constrain the viewport to the captured blocks (enterBlockView fits the map
  // to their bbox via mapOptions.bounds; this keeps the user from wandering).
  useEffect(() => {
    const map = getMapRef();
    if (!inBlockView || !map) return;
    if (
      !Array.isArray(bounds) ||
      bounds.length !== 4 ||
      !bounds.every(n => typeof n === 'number')
    ) {
      return;
    }
    let current = bounds as Bbox;
    const constrain = () => {
      // Full-bbox padding on each side, for context around the unit; the
      // padded box also sets the minZoom floor below.
      const maxBounds = padBbox(current, 1);
      map.setMaxBounds(maxBounds);
      // maxBounds only implicitly floors the zoom; the scroll handler keeps
      // accumulating its target below that floor, so zooming back in must pay
      // off the invisible overshoot first and feels stuck. An explicit minZoom
      // clamps the scroll target too.
      const fitZoom = map.cameraForBounds(maxBounds)?.zoom;
      if (fitZoom !== undefined) map.setMinZoom(Math.max(0, fitZoom));
    };
    constrain();
    // The bounds only count the unit's pieces in tiles loaded at entry. Once
    // the camera settles and more tiles have loaded, loosen the limits to any
    // part that reaches past them. Loosening never moves the camera, and
    // mapOptions.bounds stays put so the map isn't re-fit.
    const widen = () => {
      if (!focusedParentId) return;
      const seen = queryRenderedGeoIdBounds(map, useMapStore.getState().mapDocument, [
        focusedParentId,
      ]);
      const next = seen && widenBbox(current, padBbox(seen, 0.3));
      if (!next) return;
      current = next;
      constrain();
    };
    const widenWhenIdle = () => {
      map.off('idle', widen);
      map.once('idle', widen);
    };
    widenWhenIdle();
    map.on('moveend', widenWhenIdle);
    return () => {
      map.off('moveend', widenWhenIdle);
      map.off('idle', widen);
      map.setMaxBounds(null);
      map.setMinZoom(null);
    };
  }, [inBlockView, bounds, focusedParentId, getMapRef]);

  if (inBlockView) {
    return (
      <MapPill
        testId="block-mode-pill"
        onEscape={exitBlockView}
        action={{label: 'Exit block view (Esc)', onClick: exitBlockView}}
      >
        {activeTool === ACTIVE_TOOLS.SHATTER ? (
          <>
            <b>Choose Paint</b> to paint these blocks, or another {unitName} to break
          </>
        ) : activeTool === ACTIVE_TOOLS.BRUSH || activeTool === ACTIVE_TOOLS.ERASER ? (
          <>
            {activeTool === ACTIVE_TOOLS.BRUSH ? 'Painting' : 'Erasing'} blocks ·{' '}
            <b>click another {unitName}</b> to move to it
          </>
        ) : (
          'Painting blocks'
        )}
      </MapPill>
    );
  }
  if (activeTool === ACTIVE_TOOLS.SHATTER) {
    return (
      <MapPill
        testId="block-mode-pill"
        icon={
          <InfoCircledIcon
            width={18}
            height={18}
            style={{color: 'var(--accent-9)', flexShrink: 0}}
          />
        }
        onEscape={() => setActiveTool(ACTIVE_TOOLS.BRUSH)}
      >
        <b>Choose a {unitName}</b> to break down into blocks
      </MapPill>
    );
  }
  return null;
};
