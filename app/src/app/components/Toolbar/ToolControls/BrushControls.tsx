import {Box, Flex} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {PaintByCounty} from '@components/Toolbar/PaintByCounty';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
const BRUSH_LABELS = {
  brush: 'Brush Size',
  eraser: 'Eraser Size',
  inspector: 'Spotlight Size',
}
const BRUSH_VERB = {
  brush: 'Paint counties',
  eraser: 'Erase counties',
  inspector: 'Spotlight counties',
}
export const BrushControls = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const label = BRUSH_LABELS[activeTool as keyof typeof BRUSH_LABELS];
  const countyLabel = BRUSH_VERB[activeTool as keyof typeof BRUSH_VERB];
  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap">
        <Box className="flex-grow" style={{flexGrow: 1}}>
          <BrushSizeSelector label={label} />
        </Box>
        {paintCounties && (
          <Box minWidth="75px">
            <PaintByCounty label={countyLabel} />{' '}
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
