export const NUMBER_FORMATS = {
  PERCENT: 'percent',
  STRING: 'string',
  COMPACT: 'compact',
  COMPACT3: 'compact3',
  PARTISAN: 'partisan',
  STANDARD: 'standard',
  SIGNED_PCT: 'signed_pct',
  DECIMAL_3: 'decimal_3',
} as const;

export type NumberFormat = (typeof NUMBER_FORMATS)[keyof typeof NUMBER_FORMATS];

export type InspectorFormat = (typeof NUMBER_FORMATS)[keyof Pick<
  typeof NUMBER_FORMATS,
  'PERCENT' | 'STANDARD'
>];
