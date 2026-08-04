import {NUMBER_FORMATS, type NumberFormat} from '@constants/demography/format';

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const deviationPctFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
// 0.001% as a ratio; below this we show "<0.001%" instead of a misleading 0.00%.
const MIN_DEVIATION_PCT = 0.00001;
export const formatDeviationPct = (value: number) =>
  value > 0 && value < MIN_DEVIATION_PCT ? '<0.001%' : deviationPctFormatter.format(value);
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
});
const compact3Formatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  minimumFractionDigits: 2,
});
const standardFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const stringFormatter = (n: number) => Math.round(n).toLocaleString();

export const formatNumber = (value: number | undefined, format: NumberFormat) => {
  if (value === undefined) {
    return value;
  }
  switch (format) {
    case NUMBER_FORMATS.PERCENT:
      return percentFormatter.format(value);
    case NUMBER_FORMATS.STRING:
      return stringFormatter(value);
    case NUMBER_FORMATS.COMPACT:
      return compactFormatter.format(value);
    case NUMBER_FORMATS.COMPACT3:
      return compact3Formatter.format(value);
    case NUMBER_FORMATS.STANDARD:
      return standardFormatter.format(value);
    case NUMBER_FORMATS.SIGNED_PCT:
      return value >= 0 ? `+${(value * 100).toFixed(2)}%` : `${(value * 100).toFixed(2)}%`;
    case NUMBER_FORMATS.DECIMAL_3:
      return isNaN(value) ? '—' : value.toFixed(3);
    default:
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled format case: ${exhaustiveCheck}`);
  }
};
