export const EVAL_MODES = {
  SHARE: 'share',
  COUNT: 'count',
  TOTPOP: 'totpop',
} as const;

export type EvalMode = (typeof EVAL_MODES)[keyof typeof EVAL_MODES];
