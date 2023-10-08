/**
 * Replaces the item at the ith index in a list with a
 * specified item.
 * @param {any[]} list 
 * @param {number} i 
 * @param {any} item 
 * @returns A copy of an array with the ith item replaced.
 */

export function replace(list : any[], i : number, item : any) {
    return [...list.slice(0, i), item, ...list.slice(i + 1)];
  }