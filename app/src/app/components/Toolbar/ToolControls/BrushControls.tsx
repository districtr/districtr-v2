import {Box, Flex} from '@radix-ui/themes';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {PaintBySelect} from '@components/Toolbar/ToolControls/PaintByControls';

/** The inspector's brush row: what one footprint reads, and its size. */
export const BrushControls = () => (
  <Flex direction="row" gapX="4" gapY="2" wrap="wrap" align="start">
    {/* Blocks would read the same units here, and leave Paint picking a unit. */}
    <PaintBySelect label="Inspect by" offerBlocks={false} />
    <Box className="flex-grow" style={{flexGrow: 1}}>
      <BrushSizeSelector />
    </Box>
  </Flex>
);
