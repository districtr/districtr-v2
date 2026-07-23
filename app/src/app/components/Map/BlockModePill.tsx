'use client';
import React, {useEffect} from 'react';
import {Button, Flex, Text} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ACTIVE_TOOLS} from '@constants/map/tools';

const PILL_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  background: 'white',
  borderRadius: 99,
  boxShadow: '0 4px 16px rgba(0,0,20,0.25)',
  pointerEvents: 'auto',
  whiteSpace: 'nowrap',
};

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
      // Half-bbox padding: room to nudge, not to leave.
      const padX = (east - west) / 2;
      const padY = (north - south) / 2;
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
      // ponytail: contain-fit zoom sits a bit below the implicit floor when the
      // bbox and viewport aspects differ; residual overshoot is <1 zoom level.
      const fitZoom = map.cameraForBounds(maxBounds)?.zoom;
      if (fitZoom !== undefined) map.setMinZoom(Math.max(0, fitZoom));
    }
    return () => {
      map.setMaxBounds(null);
      map.setMinZoom(null);
    };
  }, [inBlockView, bounds, getMapRef]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (inBlockView) {
        exitBlockView();
      } else if (activeTool === ACTIVE_TOOLS.SHATTER) {
        setActiveTool(ACTIVE_TOOLS.BRUSH);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [inBlockView, activeTool, exitBlockView, setActiveTool]);

  if (inBlockView) {
    return (
      <Flex align="center" gap="2" px="3" py="2" style={PILL_STYLE} data-testid="block-mode-pill">
        <Text size="2">Painting blocks</Text>
        <Button size="1" variant="solid" onClick={() => exitBlockView()}>
          Exit block view (Esc)
        </Button>
      </Flex>
    );
  }
  if (activeTool === ACTIVE_TOOLS.SHATTER) {
    return (
      <Flex align="center" gap="2" px="3" py="2" style={PILL_STYLE} data-testid="block-mode-pill">
        <InfoCircledIcon style={{color: 'var(--accent-9)', flexShrink: 0}} />
        <Text size="2">
          <b>Choose a unit</b> to break into blocks
        </Text>
      </Flex>
    );
  }
  return null;
};
