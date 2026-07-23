import {Flex, Button, Text} from '@radix-ui/themes';
import {MaskOffIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
import {CurrentDistrictCard} from '@components/Toolbar/CurrentDistrictCard';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

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
      <BrushSizeSelector />
      {showZonePicker ? (
        mapMode === MAP_MODES.DISTRICTS ? (
          // Concept 1a: the picker lives inside a card naming the district
          // being painted, with its fill state and per-district actions.
          <CurrentDistrictCard>
            <ZonePicker />
          </CurrentDistrictCard>
        ) : (
          <Flex direction="row" flexGrow={'0'} maxWidth={'100%'} p="0" m="0">
            <ZonePicker />
          </Flex>
        )
      ) : null}

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
