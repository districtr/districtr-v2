/**
 * Returns the range of values in an array.
 * @param {number[]} values 
 * @returns Range of values.
 */

export function extent(values : number[]) {
    return Math.min(...values) - Math.max(...values);
  }