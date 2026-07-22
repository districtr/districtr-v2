'use client';
import React, {useState} from 'react';
import {Flex, IconButton, Text} from '@radix-ui/themes';
import {Cross2Icon, InfoCircledIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {MAP_MODES} from '@constants/map/mode';

/**
 * Concept 1a: a contextual hint pill replaces the empty first paint stroke.
 * Shows on an untouched map and disappears once anything is painted.
 */
export const MapHintPill = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const {populationData, demoIsLoaded} = useZonePopulations();
  // Session-local dismiss is enough; the pill self-retires on first paint.
  const [dismissed, setDismissed] = useState(false);

  const anythingPainted = populationData.some(d => (d.total_pop_20 ?? 0) > 0);
  if (
    dismissed ||
    !isEditing ||
    mapMode !== MAP_MODES.DISTRICTS ||
    !demoIsLoaded ||
    anythingPainted
  )
    return null;

  return (
    <Flex
      align="center"
      gap="2"
      px="3"
      py="2"
      style={{
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
      }}
      data-testid="map-hint-pill"
    >
      <InfoCircledIcon style={{color: 'var(--accent-9)', flexShrink: 0}} />
      <Text size="2">
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
