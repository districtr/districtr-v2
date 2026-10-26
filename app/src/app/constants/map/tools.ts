export const ACTIVE_TOOLS = {
  PAN: 'pan',
  BRUSH: 'brush',
  ERASER: 'eraser',
  // Mostly internal: under Paint by blocks, setActiveTool turns Paint/Erase
  // into this while no unit is broken (picking one), and the UI shows the tool
  // it stands in for (selectShownTool in mapControlsStore). The toolbar's
  // Break button is that same Paint by blocks shortcut (ToolUtils).
  SHATTER: 'shatter',
  // Picks the paint mask: click an area of the Mask by layer (MaskControls).
  MASK: 'mask',
  UNDO: 'undo',
  REDO: 'redo',
  INSPECTOR: 'inspector',
} as const;

export type ActiveTool = (typeof ACTIVE_TOOLS)[keyof typeof ACTIVE_TOOLS];

// Tools only exposed in Super Draw mode. Shared by the toolbar filter and the
// mode-exit reset so the two can't drift.
export const SUPER_DRAW_TOOLS: ActiveTool[] = [
  ACTIVE_TOOLS.SHATTER,
  ACTIVE_TOOLS.MASK,
  ACTIVE_TOOLS.INSPECTOR,
];

// Tools that change the plan. Disabled while painted districts are hidden, so
// nothing is edited out of sight.
export const DISTRICT_EDIT_TOOLS: ActiveTool[] = [
  ACTIVE_TOOLS.BRUSH,
  ACTIVE_TOOLS.ERASER,
  ACTIVE_TOOLS.SHATTER,
];
