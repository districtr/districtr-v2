/**
 * Returns value as a percentage of the total.
 * @param {number} value 
 * @param {number} total 
 * @returns value / total * 100.
 */

export function asPercent(value : number, total : number) {
    return `${Math.round(100 * (value / total))}%`;
  }