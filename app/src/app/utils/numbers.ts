import {NUMBER_FORMATS, type NumberFormat} from '@constants/demography/format';

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
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
    case NUMBER_FORMATS.STRING: // Added case for 'string'
      return stringFormatter(value); // Format as string
    case NUMBER_FORMATS.COMPACT: // Added case for 'compact'
      return compactFormatter.format(value); // Format as compact
    case NUMBER_FORMATS.COMPACT3: // Added case for 'compact'
      return compact3Formatter.format(value); // Format as compact
    case NUMBER_FORMATS.PARTISAN:
      const party = value > 0 ? 'D' : 'R';
      const percentFormat = percentFormatter.format(Math.abs(value));
      return `${party} +${percentFormat}`;
    case NUMBER_FORMATS.STANDARD:
      return standardFormatter.format(value);
    default:
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled format case: ${exhaustiveCheck}`);
  }
};
