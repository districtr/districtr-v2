'use client';
import {useMemo} from 'react';
import {Box, Button, DropdownMenu} from '@radix-ui/themes';
import {MaskOffIcon, MaskOnIcon} from '@radix-ui/react-icons';
import {getMaskOverlayId, getOverlayName, useOverlayStore} from '@store/overlayStore';
import {useMapStore} from '@store/mapStore';
import {useToolbarStore} from '@store/toolbarStore';
import {useIsSingleCounty} from '@/app/hooks/useIsSingleCounty';
import {HelpTip} from '@components/HelpTip/HelpTip';
import {ACCESS_STATES} from '@constants/document/state';
import {COUNTY_SOURCE_ID} from '@constants/map/layerIds';

/** The paint controls' entry point to the overlay paint mask (the same one
 * as the Mask buttons under Map Layers > Boundaries and areas): pick a layer,
 * then click one of its areas; while armed or masked it cancels/releases. */
export const PaintMaskControl = () => {
  // Paint-mask creation is a Super Draw feature, same as in OverlaysPanel.
  const superDraw = useToolbarStore(state => state.superDraw);
  const overlays = useMapStore(state => state.mapDocument?.overlays);
  const readOnly = useMapStore(state => state.mapStatus?.access === ACCESS_STATES.READ);
  const isSingleCounty = useIsSingleCounty();
  const maskLayerId = useOverlayStore(state => state.paintConstraint?.overlayId);
  const selecting = useOverlayStore(state => !!state.selectingLayerId);
  const selectOverlayFeature = useOverlayStore(state => state.selectOverlayFeature);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const layers = useMemo(() => {
    const names = [...new Set((overlays ?? []).map(o => o.name))].sort();
    return [
      ...(isSingleCounty ? [] : [{id: COUNTY_SOURCE_ID, name: 'Counties'}]),
      ...names.flatMap(name => {
        const id = getMaskOverlayId(overlays ?? [], name);
        return id ? [{id, name}] : [];
      }),
    ];
  }, [overlays, isSingleCounty]);

  if (!superDraw || !layers.length) return null;

  const button = maskLayerId ? (
    <Button size="1" onClick={clearPaintConstraint} className="cursor-pointer">
      <MaskOffIcon />
      Unmask ({maskLayerId === COUNTY_SOURCE_ID ? 'county' : getOverlayName(maskLayerId)})
    </Button>
  ) : selecting ? (
    <Button size="1" variant="soft" onClick={clearPaintConstraint} className="cursor-pointer">
      <MaskOffIcon />
      Cancel mask selection
    </Button>
  ) : (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={readOnly}>
        <Button size="1" variant="soft" className="cursor-pointer">
          <MaskOnIcon />
          Mask painting to an area
          <DropdownMenu.TriggerIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content size="1">
        <DropdownMenu.Label>Choose a layer, then click an area</DropdownMenu.Label>
        {layers.map(layer => (
          <DropdownMenu.Item key={layer.id} onSelect={() => selectOverlayFeature(layer.id)}>
            {layer.name}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );

  // Box: HelpTip attaches its hover handlers to a DOM child, which
  // DropdownMenu.Root doesn't render.
  return (
    <HelpTip tip="paintMask">
      <Box width="fit-content">{button}</Box>
    </HelpTip>
  );
};
