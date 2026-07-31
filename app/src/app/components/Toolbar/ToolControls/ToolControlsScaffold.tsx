'use client';
import React from 'react';
import {Box, Button, Flex, Text} from '@radix-ui/themes';
import {MaskOffIcon} from '@radix-ui/react-icons';
import {styled} from '@stitches/react';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
import {KeyOptionToggles} from '@components/Toolbar/ToolControls/KeyOptionToggles';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

// Sidebar container width (it defaults to 35vw and is user-resizable) at which
// the left/right columns stop stacking.
const TWO_COLUMN_BREAKPOINT = 400;

const TwoColumnGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 'var(--space-4)',
  width: '100%',
  [`@container (min-width: ${TWO_COLUMN_BREAKPOINT}px)`]: {
    // max-content, not a fraction: the right column's toggle labels must
    // never wrap, regardless of container width or font metrics. The left
    // column (zone picker) absorbs whatever space is left.
    gridTemplateColumns: '1fr max-content',
  },
});

const disabledSectionStyle = (disabled: boolean): React.CSSProperties =>
  disabled ? {opacity: 0.5, pointerEvents: 'none'} : {};

/** The one layout every paint-adjacent tool (pan, paint, erase, break) shares:
 * a county-brush + brush-size row on top, then a district/zone picker beside
 * a fixed column of map-display toggles. Which pieces are interactive varies
 * by tool — the structure never does, so nothing mounts or unmounts as the
 * active tool changes. Inspector is the one tool exempt from this: it keeps
 * its own, separate layout (see InspectorControls). */
export const ToolControlsScaffold: React.FC = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);

  // Before a unit is broken there's nothing to paint yet, so the whole
  // paint-adjacent surface reads as inert — once broken, break paints blocks
  // and gets the exact same live controls as paint.
  const breakBeforeBlockView = activeTool === ACTIVE_TOOLS.SHATTER && !inBlockView;
  const sliderDisabled = activeTool === ACTIVE_TOOLS.PAN || breakBeforeBlockView;
  const zonePickerDisabled =
    activeTool === ACTIVE_TOOLS.PAN ||
    breakBeforeBlockView ||
    (activeTool === ACTIVE_TOOLS.ERASER && mapMode === MAP_MODES.DISTRICTS);

  return (
    <Flex direction="column" gapY="4" width="100%">
      <Flex direction="row" gapX="4" wrap="wrap" align="center">
        {paintCounties && (
          // mt centers the card on the slider track, offsetting the "Brush Size"
          // label above it (flex centering shifts content by half the margin).
          // PaintByCounty manages its own disabled state (locked for the whole
          // break tool session) — it isn't gated by sliderDisabled.
          <Box className="mt-3">
            <PaintByCounty />
          </Box>
        )}
        <Box className="flex-grow" style={{flexGrow: 1, ...disabledSectionStyle(sliderDisabled)}}>
          <BrushSizeSelector />
        </Box>
      </Flex>

      <TwoColumnGrid>
        <Box style={disabledSectionStyle(zonePickerDisabled)}>
          <ZonePicker disabled={zonePickerDisabled} />
        </Box>
        <KeyOptionToggles />
      </TwoColumnGrid>

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
