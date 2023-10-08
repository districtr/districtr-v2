/**
 * Returns stringified number with commas.
 * @param {number} x 
 * @returns {string} Number with commas.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function numberWithCommas(x : number) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}