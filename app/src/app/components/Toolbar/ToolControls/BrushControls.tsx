import {Box, Flex, Button} from '@radix-ui/themes';
import {CrossCircledIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';

export const BrushControls = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const handleClearConstraint = () => {
    clearPaintConstraint();
    setPaintFunction(getFeaturesInBbox);
  };

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap">
        <Box className="flex-grow" style={{flexGrow: 1}}>
          <BrushSizeSelector />
        </Box>
        {paintCounties && (
          <Box minWidth="75px">
            <PaintByCounty />{' '}
          </Box>
        )}
        {paintConstraint && (
          <Box minWidth="100px">
            <Button size="1" variant="soft" color="orange" onClick={handleClearConstraint}>
              <CrossCircledIcon />
              Release: {paintConstraint.featureName}
            </Button>
          </Box>
        )}
      </Flex>
      {activeTool === 'brush' ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <ZonePicker />
        </div>
      ) : null}
    </Flex>
  );
};
