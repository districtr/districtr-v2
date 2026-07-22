export const TABLE_DISPLAY_MODES = {
  SHARE: 'share',
  COUNT: 'count',
} as const;

export type TableDisplayMode = (typeof TABLE_DISPLAY_MODES)[keyof typeof TABLE_DISPLAY_MODES];
