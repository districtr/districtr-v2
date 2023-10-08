/**
 * Rounds a number to a specified decimal.
 * @param n 
 * @param places 
 * @returns n rounded to the nearest places place.
 */

export function roundToDecimal(n : number, places : number) {
    return Math.round(n * Math.pow(10, places)) / Math.pow(10, places);
  }