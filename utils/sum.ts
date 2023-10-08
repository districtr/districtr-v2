/**
 * Sums all values over an array.
 * @param {number[]} values 
 * @returns {number} Total.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function sum(values : number[]) {
    return values.reduce((total, value) => total + value, 0);
  }