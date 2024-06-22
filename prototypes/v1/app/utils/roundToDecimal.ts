/**
 * Rounds a number to a specified decimal.
 * @param n
 * @param places
 * @returns n rounded to the nearest places place.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function roundToDecimal(n: number, places: number) {
  return Math.round(n * Math.pow(10, places)) / Math.pow(10, places);
}
