export const onlyUnique = (value: unknown, index: number, self: unknown[]) => {
  return self.indexOf(value) === index;
};
export const onlyUniqueProperty =
  (property: string) => (value: unknown, index: number, self: unknown[]) => {
    return self.findIndex((row: any) => row[property]) === index;
  };
