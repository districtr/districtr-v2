import {Box, Flex} from '@radix-ui/themes';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';

export const BrushControls = () => {
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);

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
    </Flex>
  );
};
