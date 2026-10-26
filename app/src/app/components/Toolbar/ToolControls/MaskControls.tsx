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
  const maskBy = maskedLayerId ?? maskByLayerId ?? layers[0]?.id;

  // Opening the tool (once the layers are known) shows the Mask by layer; an
  // active mask stays as it is.
  const firstLayerId = layers[0]?.id;
  useEffect(() => {
    const {paintConstraint, maskByLayerId: current} = useOverlayStore.getState();
    if (paintConstraint) {
      useOverlayStore.setState({maskByLayerId: paintConstraint.overlayId});
    } else if (current ?? firstLayerId) {
      setMaskBy((current ?? firstLayerId)!);
    }
  }, [firstLayerId, setMaskBy]);

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
