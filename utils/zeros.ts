/**
 * Returns an array of zeros of size n.
 * @param {number} n 
 * @returns {number[]} Array of zeros of size n.
 */

export function zeros(n : number): number[] {
  let vector : number[] = [];
  for (let i = 0; i < n; i++) {
    vector.push(0);
  }
  return vector;
}