/**
 * Returns value as a percentage of the total.
 * @param {number} value 
 * @param {number} total 
 * @returns {string} The value as a percentage of the total, rounded to the nearest whole number with a '%' sign.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function asPercent(value : number, total : number) {
    return `${Math.round(100 * (value / total))}%`;
  }