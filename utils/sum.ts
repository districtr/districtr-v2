/**
 * Sums all values over an array.
 * @param {number[]} values 
 * @returns {number} Total.
 */

export function sum(values : number[]) {
    return values.reduce((total, value) => total + value, 0);
  }