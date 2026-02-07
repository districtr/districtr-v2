import { Box, Flex, Button, Text } from '@radix-ui/themes';
import { MaskOffIcon } from '@radix-ui/react-icons';
import { useMapControlsStore } from '@store/mapControlsStore';
import { useFeatureFlagStore } from '@store/featureFlagStore';
import { useOverlayStore } from '@/app/store/overlayStore';
import { BrushSizeSelector } from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';
import PaintCommunity from '@components/Toolbar/PaintCommunity';
import { CommunityControls } from '@components/Toolbar/CommunityControls';
import { ZonePicker } from '@components/Toolbar/ZonePicker';

export const BrushControls = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const paintCommunity = useMapControlsStore(state => state.mapOptions.paintCommunity);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap">
        <Box className="flex-grow" style={{ flexGrow: 1 }}>
          <BrushSizeSelector />
        </Box>
        {paintCounties && (
          <Box minWidth="75px">
            <PaintByCounty />{' '}
          </Box>
        )}
      </Flex>
      {activeTool === 'brush' ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          {paintCommunity ? <CommunityControls mode="brush" /> : <ZonePicker />}
        </div>
      ) : null}

      {activeTool === 'eraser' && paintCommunity ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <CommunityControls mode="erase" />
        </div>
      ) : null}

      {paintConstraint && (
        <Button variant="outline" color="orange" onClick={clearPaintConstraint}>
          <Flex justify="between" align="center" gap="2">
            <Text size="2">Release paint mask</Text>
            <MaskOffIcon />
          </Flex>
        </Button>
      )}

      <Flex gap="3" align="center" wrap="wrap">
        <Box minWidth="95px">
          <PaintCommunity />
        </Box>
      </Flex>
    </Flex>
  );
};
