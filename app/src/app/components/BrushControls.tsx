import {Box, Flex} from '@radix-ui/themes';
import {useMapStore} from '../store/mapStore';
import {BrushSizeSelector} from './Toolbar/BrushSizeSelector';
import PaintByCounty from './Toolbar/PaintByCounty';
import {ZonePicker} from './Toolbar/ZonePicker';
export const BrushControls = () => {
  const activeTool = useMapStore(state => state.activeTool);

  return (
    <div className="gap-0 flex flex-col justify-around min-w-60">
      <Flex direction="row" gapX="4">
        <Box width="100%">
          <BrushSizeSelector />
        </Box>
        <Box minWidth="75px">
          <PaintByCounty />{' '}
        </Box>
      </Flex>
      {activeTool === 'brush' ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <ZonePicker />
        </div>
      ) : null}
    </div>
  );
};
