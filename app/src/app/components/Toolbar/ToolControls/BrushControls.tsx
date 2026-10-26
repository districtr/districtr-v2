import {Box, Flex} from '@radix-ui/themes';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {PaintByControl} from '@components/Toolbar/ToolControls/PaintByControls';

/** The inspector's brush row: what one footprint reads, and its size. */
export const BrushControls = () => (
  <Flex direction="row" gapX="4" gapY="2" wrap="wrap" align="start">
    <PaintByControl label="Inspect by" forInspector />
    <Box className="flex-grow" style={{flexGrow: 1}}>
      <BrushSizeSelector />
    </Box>
  </Flex>
);
