const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
})
const stringFormatter = (n: number) => n.toLocaleString()

export type NumberFormats = 'percent' | 'string' | 'compact'
export const formatNumber = (
  value: number | undefined,
  format: NumberFormats
) => {
  if (value === undefined) {
    return value
  }
  switch(format){
    case 'percent':
      return percentFormatter.format(value)
    case 'string': // Added case for 'string'
      return stringFormatter(value) // Format as string
    case 'compact': // Added case for 'compact'
      return compactFormatter.format(value) // Format as compact
    default:
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled format case: ${exhaustiveCheck}`);
    
  }
}