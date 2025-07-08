/**
 * onlyUnique
 * A filter function that returns true only for the first occurrence of each unique value in an array.
 *
 * @param {unknown} value - The current element being processed
 * @param {number} index - The index of the current element
 * @param {unknown[]} self - The array being filtered
 * @returns {boolean} - True if this is the first occurrence of the value, false otherwise
 */
export const onlyUnique = (value: unknown, index: number, self: unknown[]) => {
  return self.indexOf(value) === index;
};

/**
 * fastUniqBy
 * Efficiently removes duplicate objects from an array based on a specified property.
 * Uses a Set for O(1) lookup performance and a vanilla for loop for optimal speed.
 *
 * @template T - The type of objects in the array, must extend object
 * @param {T[]} array - The array of objects to deduplicate
 * @param {keyof T} property - The property key to use for determining uniqueness
 * @returns {T[]} - A new array with duplicates removed, preserving the first occurrence of each unique value
 *
 * @example
 * const users = [
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' },
 *   { id: 1, name: 'Alice' } // duplicate
 * ];
 * const uniqueUsers = fastUniqBy(users, 'id');
 * // Result: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
 */
export const fastUniqBy = <T extends object>(array: T[], property: keyof T) => {
  const seen = new Set<T[keyof T]>();
  const result = [];
  for (let i = 0; i < array.length; i++) {
    const item = array[i];
    const value = item[property];
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(item);
  }
  return result;
};
