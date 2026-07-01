export const EVAL_MODES = {
  SHARE: 'share',
  COUNT: 'count',
  TOTPOP: 'totpop',
  PARTISAN: 'partisan',
} as const;

export type EvalMode = (typeof EVAL_MODES)[keyof typeof EVAL_MODES];
