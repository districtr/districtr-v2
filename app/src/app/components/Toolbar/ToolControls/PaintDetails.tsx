'use client';
import React from 'react';
import {Flex} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {CurrentDistrictCard} from '@components/Toolbar/CurrentDistrictCard';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

const BRUSH_TOOLS: ActiveTool[] = [ACTIVE_TOOLS.BRUSH, ACTIVE_TOOLS.ERASER, ACTIVE_TOOLS.SHATTER];

/** The scrollable slice of the paint controls: brush size and the
 * current-district card. Lives at the top of the sidebar's scroll area (and
 * in the mobile dock) so the sticky region stays short on small screens —
 * only the tool buttons and district selector remain pinned. */
export const PaintDetails = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const mapMode = useMapControlsStore(state => state.mapMode);
  if (!isEditing || !BRUSH_TOOLS.includes(activeTool)) return null;
  const showCard =
    mapMode === MAP_MODES.DISTRICTS &&
    (activeTool === ACTIVE_TOOLS.BRUSH || activeTool === ACTIVE_TOOLS.SHATTER);
  return (
    <Flex direction="column" gap="2">
      <BrushSizeSelector />
      {showCard && <CurrentDistrictCard />}
    </Flex>
  );
};
