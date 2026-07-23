import {Flex, Button, Text} from '@radix-ui/themes';
import {MaskOffIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

/** The sticky slice of the paint controls: just the district selector (and
 * the paint-mask release). Brush size and the current-district card scroll
 * with the data panels — see PaintDetails. */
export const BrushControls = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const showZonePicker =
    activeTool === ACTIVE_TOOLS.BRUSH ||
    // Break paints blocks, so it keeps the full paint controls.
    activeTool === ACTIVE_TOOLS.SHATTER ||
    (mapMode === MAP_MODES.COI && activeTool === ACTIVE_TOOLS.ERASER);

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      {showZonePicker && (
        <Flex direction="row" flexGrow={'0'} maxWidth={'100%'} p="0" m="0">
          <ZonePicker />
        </Flex>
      )}

      {paintConstraint && (
        <Button variant="outline" color="orange" onClick={clearPaintConstraint}>
          <Flex justify="between" align="center" gap="2">
            <Text size="2">Release paint mask</Text>
            <MaskOffIcon />
          </Flex>
        </Button>
      )}
    </Flex>
  );
};
