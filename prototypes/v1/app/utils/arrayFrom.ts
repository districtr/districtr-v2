/**
 * Creates a new array with the specified length and fills it with the specified value
 *
 * @param {number} length - The length of the new array.
 * @param {any} [value=0] - The value to fill the new array with.
 * @returns {Array} - The new array.
 *
 * Districtr reference:
 * Original Function: zeros
 * Original Reference: https://github.com/uchicago-dsi/districtr-legacy/blob/701b19fec1aae744cd17111c7836eb7aef8c05a8/src/utils.js#L1
 */
export const arrayFrom = (length: number, value: any = 0) => Array.from({length}, () => value);
