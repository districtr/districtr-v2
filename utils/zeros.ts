/**
 * Returns an array of zeros of size n.
 * 
 * @param {number} n 
 * @returns {number[]} Array of zeros of size n.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function zeros(n : number): number[] {
  let vector : number[] = [];
  for (let i = 0; i < n; i++) {
    vector.push(0);
  }
  return vector;
}