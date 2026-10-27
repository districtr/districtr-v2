'use client';
import {useEffect} from 'react';
import {Button, Flex, Text} from '@radix-ui/themes';
import {MaskOffIcon} from '@radix-ui/react-icons';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMaskLayers} from '@/app/hooks/useMaskLayers';
import {ACCESS_STATES} from '@constants/document/state';
import {HelpTip} from '@components/HelpTip/HelpTip';
import {LabeledSelect, optionLabel} from '@components/Toolbar/ToolControls/PaintByControls';

/** The Mask tool's controls: which layer a click masks by, what's masked now,
 * and an explicit release. Clicking an area of the layer (mapEvents) sets or
 * moves the mask; Paint and Erase then only change units inside it. */
export const MaskControls = () => {
  const layers = useMaskLayers();
  const readOnly = useMapStore(state => state.mapStatus?.access === ACCESS_STATES.READ);
  const maskByLayerId = useOverlayStore(state => state.maskByLayerId);
  const maskedLayerId = useOverlayStore(state => state.paintConstraint?.overlayId);
  const setMaskBy = useOverlayStore(state => state.setMaskBy);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  // A remembered layer can drop out (e.g. Counties on a single-county map).
  const knownMaskBy = layers.some(layer => layer.id === maskByLayerId) ? maskByLayerId : null;
  const maskBy = maskedLayerId ?? knownMaskBy ?? layers[0]?.id;

  // With no mask up, the Mask by layer is shown so its areas can be clicked:
  // when the tool opens, and again after a release (which restores the layers
  // from before, usually without it). An active mask stays as it is. Closing
  // the tool without masking puts the hidden layers back.
  const showMaskTool = useOverlayStore(state => state.showMaskTool);
  const closeMaskTool = useOverlayStore(state => state.closeMaskTool);
  useEffect(() => {
    if (!maskBy) return;
    showMaskTool(maskBy);
    // No cleanup with a mask up: it stays, with its layer, after the tool closes.
    return maskedLayerId ? undefined : closeMaskTool;
  }, [maskedLayerId, maskBy, showMaskTool, closeMaskTool]);

  if (!layers.length) {
    return (
      <Text size="2" color="gray">
        This map has no boundary layers to mask by.
      </Text>
    );
  }

  return (
    <Flex direction="row" gapX="4" gapY="2" wrap="wrap" align="end">
      <HelpTip tip="paintMask">
        <LabeledSelect
          label="Mask by"
          value={maskBy ?? ''}
          groups={[
            {options: layers.map(layer => ({value: layer.id, label: optionLabel(layer.name)}))},
          ]}
          disabled={readOnly}
          onValueChange={setMaskBy}
        />
      </HelpTip>
      <Flex direction="column" gap="1" style={{flex: '1 1 160px'}}>
        <Text size="2" color="gray">
          {maskedLayerId
            ? 'Paint and Erase only change units inside the outlined area. Click another area to move the mask.'
            : 'Click an area on the map. Paint and Erase then only change units inside it.'}
        </Text>
      </Flex>
      <Button
        variant="soft"
        disabled={!maskedLayerId || readOnly}
        onClick={clearPaintConstraint}
        className="cursor-pointer"
      >
        <MaskOffIcon />
        Release mask
      </Button>
    </Flex>
  );
};
