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
