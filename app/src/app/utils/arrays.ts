export const onlyUnique = (value: unknown, index: number, self: unknown[]) => {
  return self.indexOf(value) === index;
};
export const onlyUniqueProperty =
  (property: string) => (element: any, index: number, array: unknown[]) => {
    return array.findIndex((row: any) => row[property] === element[property]) === index;
  };
