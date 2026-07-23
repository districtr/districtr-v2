'use client';
import React, {useState} from 'react';
import {Flex, IconButton, Text} from '@radix-ui/themes';
import {Cross2Icon, InfoCircledIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {MAP_MODES} from '@constants/map/mode';
import {ACTIVE_TOOLS} from '@constants/map/tools';

/**
 * Concept 1a: a contextual hint pill replaces the empty first paint stroke.
 * Shows on an untouched map and disappears once anything is painted.
 */
export const MapHintPill = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  const {populationData, demoIsLoaded} = useZonePopulations();
  // Session-local dismiss is enough; the pill self-retires on first paint.
  const [dismissed, setDismissed] = useState(false);

  const anythingPainted = populationData.some(d => (d.total_pop_20 ?? 0) > 0);
  if (
    dismissed ||
    !isEditing ||
    mapMode !== MAP_MODES.DISTRICTS ||
    !demoIsLoaded ||
    anythingPainted ||
    // The break-flow pill owns this spot while breaking/painting blocks.
    activeTool === ACTIVE_TOOLS.SHATTER ||
    inBlockView
  )
    return null;

  return (
    <Flex align="center" gap="3" px="4" py="3" className="map-pill" data-testid="map-hint-pill">
      <InfoCircledIcon width={18} height={18} style={{color: 'var(--accent-9)', flexShrink: 0}} />
      <Text size="3">
        Pick a district color, then <b>click and drag</b> to paint
      </Text>
      <IconButton
        variant="ghost"
        color="gray"
        size="1"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss hint"
      >
        <Cross2Icon />
      </IconButton>
    </Flex>
  );
};
