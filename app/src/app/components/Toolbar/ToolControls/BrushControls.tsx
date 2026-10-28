import {Box, Flex} from '@radix-ui/themes';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {PaintByControl} from '@components/Toolbar/ToolControls/PaintByControls';
import {overlayIdOf} from '@constants/map/paintBy';
import {useMapControlsStore} from '@store/mapControlsStore';

/** The inspector's brush row: what one footprint reads, and its size. */
export const BrushControls = () => {
  // Inspecting a whole area reads the area under the cursor: no brush size.
  const byArea = useMapControlsStore(state => !!overlayIdOf(state.mapOptions.paintBy));
  return (
    <Flex direction="row" gapX="4" gapY="2" wrap="wrap" align="start">
      <PaintByControl label="Inspect by" forInspector />
      <Box
        className="flex-grow"
        style={{flexGrow: 1, ...(byArea ? {opacity: 0.5, pointerEvents: 'none'} : {})}}
      >
        <BrushSizeSelector />
      </Box>
    </Flex>
  );
};
