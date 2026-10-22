'use client';
import React, {useMemo, useState} from 'react';
import {DropdownMenu, Flex, IconButton, Text} from '@radix-ui/themes';
import {MaskOnIcon} from '@radix-ui/react-icons';
import {getMaskOverlayId, useOverlayStore} from '@store/overlayStore';
import {useMapStore} from '@store/mapStore';
import {useIsSingleCounty} from '@/app/hooks/useIsSingleCounty';
import {HelpTip} from '@components/HelpTip/HelpTip';
import {ACCESS_STATES} from '@constants/document/state';
import {COUNTY_SOURCE_ID} from '@constants/map/layerIds';

/** Layers a paint mask can be drawn from: Counties (multi-county maps) and
 * each boundary group with a clickable line overlay. */
export const useMaskLayers = () => {
  const overlays = useMapStore(state => state.mapDocument?.overlays);
  const isSingleCounty = useIsSingleCounty();
  return useMemo(() => {
    const names = [...new Set((overlays ?? []).map(o => o.name))].sort();
    return [
      ...(isSingleCounty ? [] : [{id: COUNTY_SOURCE_ID, name: 'Counties'}]),
      ...names.flatMap(name => {
        const id = getMaskOverlayId(overlays ?? [], name);
        return id ? [{id, name}] : [];
      }),
    ];
  }, [overlays, isSingleCounty]);
};

/** Toolbar entry to the overlay paint mask (the same one as the Mask buttons
 * under Map Layers > Boundaries and areas). Not a mode like the tools beside
 * it: the mask limits Paint/Erase/Break until released, so this stays lit
 * while you keep painting. Idle it opens a layer menu; armed or masked, a
 * click cancels/releases. */
export const MaskToolButton: React.FC<{
  layers: ReturnType<typeof useMaskLayers>;
  buttonStyle: (isActive: boolean) => React.CSSProperties;
}> = ({layers, buttonStyle}) => {
  const readOnly = useMapStore(state => state.mapStatus?.access === ACCESS_STATES.READ);
  const maskLayerId = useOverlayStore(state => state.paintConstraint?.overlayId);
  const selecting = useOverlayStore(state => !!state.selectingLayerId);
  const selectOverlayFeature = useOverlayStore(state => state.selectOverlayFeature);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const isActive = !!maskLayerId || selecting;
  // One Root/Trigger in every state (the menu just never opens while active),
  // so arming doesn't remount the button and drop keyboard focus.
  const [menuOpen, setMenuOpen] = useState(false);
  const name = layers.find(layer => layer.id === maskLayerId)?.name;

  return (
    <DropdownMenu.Root
      open={menuOpen && !isActive}
      onOpenChange={open => setMenuOpen(open && !isActive)}
    >
      <HelpTip
        tip="paintMask"
        hideLink={isActive}
        text={
          maskLayerId
            ? `Painting is limited to the ${name} area you picked. Click to unmask (or press Esc).`
            : selecting
              ? 'Click an area on the map to paint within, or click here to cancel.'
              : undefined
        }
      >
        <DropdownMenu.Trigger>
          <IconButton
            data-testid="mask-tool"
            aria-label={maskLayerId ? 'Unmask' : selecting ? 'Cancel mask' : 'Mask'}
            aria-pressed={isActive}
            className={`cursor-pointer tool-button ${selecting ? 'animate-pulse' : ''}`}
            onClick={isActive ? clearPaintConstraint : undefined}
            style={buttonStyle(isActive)}
            variant={isActive ? 'solid' : 'ghost'}
            color={isActive ? undefined : 'gray'}
            disabled={readOnly}
          >
            <Flex direction="column" align="center" gap="1">
              <MaskOnIcon width={16} height={16} />
              <Text size="1">Mask</Text>
            </Flex>
          </IconButton>
        </DropdownMenu.Trigger>
      </HelpTip>
      <DropdownMenu.Content size="1">
        <DropdownMenu.Label>Choose a layer, then click an area</DropdownMenu.Label>
        {layers.map(layer => (
          <DropdownMenu.Item
            key={layer.id}
            onSelect={() => {
              setMenuOpen(false);
              selectOverlayFeature(layer.id);
            }}
          >
            {layer.name}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
