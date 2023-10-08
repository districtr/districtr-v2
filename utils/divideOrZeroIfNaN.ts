/**
 * Divides x by y. Returns zero if NaN is passed.
 * @param { number } x 
 * @param { number } y 
 * @returns { number} x divided by y or 0
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function divideOrZeroIfNaN(x : number, y : number) {
    return ["case", [">", y, 0], ["/", x, y], 0];
  }