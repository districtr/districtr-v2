'use client';
import React, {useEffect} from 'react';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MapPill} from './MapPill';

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
  const exitBlockView = useMapStore(state => state.exitBlockView);
  const getMapRef = useMapStore(state => state.getMapRef);
  const inBlockView = captiveIds.size > 0;

  // Constrain the viewport to the captured blocks (handleShatter fits the map
  // to their bbox via mapOptions.bounds; this keeps the user from wandering).
  useEffect(() => {
    const map = getMapRef();
    if (!inBlockView || !map) return;
    if (Array.isArray(bounds) && bounds.length === 4 && bounds.every(n => typeof n === 'number')) {
      const [west, south, east, north] = bounds as [number, number, number, number];
      // Full-bbox padding on each side. Generous because the bbox comes from a
      // tile-clipped geometry (handleShatter) and can underestimate the unit's
      // true extent; the padded box also sets the minZoom floor below.
      const padX = east - west;
      const padY = north - south;
      const maxBounds: [number, number, number, number] = [
        west - padX,
        south - padY,
        east + padX,
        north + padY,
      ];
      map.setMaxBounds(maxBounds);
      // maxBounds only implicitly floors the zoom; the scroll handler keeps
      // accumulating its target below that floor, so zooming back in must pay
      // off the invisible overshoot first and feels stuck. An explicit minZoom
      // clamps the scroll target too.
      const fitZoom = map.cameraForBounds(maxBounds)?.zoom;
      if (fitZoom !== undefined) map.setMinZoom(Math.max(0, fitZoom));
    }
    return () => {
      map.setMaxBounds(null);
      map.setMinZoom(null);
    };
  }, [inBlockView, bounds, getMapRef]);

  if (inBlockView) {
    return (
      <MapPill
        testId="block-mode-pill"
        onEscape={exitBlockView}
        action={{label: 'Exit block view (Esc)', onClick: exitBlockView}}
      >
        Painting blocks
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
        <b>Choose a unit</b> to break into blocks
      </MapPill>
    );
  }
  return null;
};
