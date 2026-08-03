import {Box, Flex, Button, Text} from '@radix-ui/themes';
import {MaskOffIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';
import DisallowPaintOver from '@components/Toolbar/DisallowPaintOver';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

export const BrushControls = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const showZonePicker =
    activeTool === ACTIVE_TOOLS.BRUSH ||
    // Break paints blocks, so it keeps the full paint controls.
    activeTool === ACTIVE_TOOLS.SHATTER ||
    (mapMode === MAP_MODES.COI && activeTool === ACTIVE_TOOLS.ERASER);

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap" align="center">
        {paintCounties && (
          // mt centers the card on the slider track, offsetting the "Brush Size"
          // label above it (flex centering shifts content by half the margin)
          <Box className="mt-3">
            <PaintByCounty />
          </Box>
        )}
        <Box className="flex-grow" style={{flexGrow: 1}}>
          <BrushSizeSelector />
        </Box>
      </Flex>
      {showZonePicker ? (
        <>
          <Flex direction="row" flexGrow={'0'} maxWidth={'100%'} p="0" m="0">
            <ZonePicker />
          </Flex>
          <Flex direction="row" justify="start">
            <DisallowPaintOver />
          </Flex>
        </>
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
