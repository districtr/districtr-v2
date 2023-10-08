/**
 * Divides x by y. Returns zero if NaN is passed.
 * @param { number } x 
 * @param { number } y 
 * @returns x / y or 0
 */

export function divideOrZeroIfNaN(x : number, y : number) {
    return ["case", [">", y, 0], ["/", x, y], 0];
  }