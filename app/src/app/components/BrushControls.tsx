import {Box, Flex} from '@radix-ui/themes';
import {useMapStore} from '../store/mapStore';
import {BrushSizeSelector} from './Toolbar/BrushSizeSelector';
import PaintByCounty from './Toolbar/PaintByCounty';
import {ZonePicker} from './Toolbar/ZonePicker';
export const BrushControls = () => {
  const activeTool = useMapStore(state => state.activeTool);

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap">
        <Box className="flex-grow" style={{flexGrow: 1}}>
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
    </Flex>
  );
};
