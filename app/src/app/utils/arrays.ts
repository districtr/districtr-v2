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
 * dedupeOnProperty
 * Creates a type-safe filter function that returns true only for the first occurrence of each unique property value in an array.
 *
 * @template T - The type of objects in the array
 * @param {keyof T} property - The property key to check for uniqueness
 * @returns {(element: T, index: number, array: T[]) => boolean} - A type-safe filter function that can be used with Array.filter()
 */
export const dedupeOnProperty =
  <T extends object>(property: keyof T) =>
  (element: T, index: number, array: T[]) => {
    return array.findIndex((row: T) => row[property] === element[property]) === index;
  };

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

export const shallowCompareArray = (curr: unknown[], prev: unknown[]) => {
  if (curr.length !== prev.length) {
    return false;
  }
  for (let i = 0; i < curr.length; i++) {
    if (curr[i] !== prev[i]) {
      return false;
    }
  }
  return true;
};
