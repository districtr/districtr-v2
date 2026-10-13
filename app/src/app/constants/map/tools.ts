export const ACTIVE_TOOLS = {
  PAN: 'pan',
  BRUSH: 'brush',
  ERASER: 'eraser',
  SHATTER: 'shatter',
  UNDO: 'undo',
  REDO: 'redo',
  INSPECTOR: 'inspector',
} as const;

export type ActiveTool = (typeof ACTIVE_TOOLS)[keyof typeof ACTIVE_TOOLS];

// Tools only exposed in Super Draw mode. Shared by the toolbar filter and the
// mode-exit reset so the two can't drift.
export const SUPER_DRAW_TOOLS: ActiveTool[] = [ACTIVE_TOOLS.SHATTER, ACTIVE_TOOLS.INSPECTOR];
