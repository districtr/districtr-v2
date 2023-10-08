/**
 * Replaces the item at the ith index in a list with a
 * specified item.
 * @param {any[]} list 
 * @param {number} i 
 * @param {any} item 
 * @returns A copy of an array with the ith item replaced.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function replace(list : any[], i : number, item : any) {
    return [...list.slice(0, i), item, ...list.slice(i + 1)];
  }