/**
 * Returns stringified number with commas.
 * @param {number} x 
 * @returns {string} Number with commas.
 */

export function numberWithCommas(x : number) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}