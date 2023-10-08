/**
 * Returns the range of values in an array.
 * @param {number[]} values 
 * @returns Range of values.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function extent(values : number[]) {
    return Math.min(...values) - Math.max(...values);
  }