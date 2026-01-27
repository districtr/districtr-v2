import { colorScheme as DefaultColorScheme } from "@/app/constants/colors";
export const extendColorArray = (
  colorArray: string[], 
  numDistricts: number,
  defaultColorArray: string[] = DefaultColorScheme  
) => {
  let newColorArray = [...colorArray];
  while (newColorArray.length < numDistricts) {
    const unusedDefaultColors = defaultColorArray.filter(color => !newColorArray.includes(color));
    newColorArray = newColorArray
      .concat(...unusedDefaultColors)
      .concat(...defaultColorArray.map(hexshift))
      .filter((color, index, array) => array.findIndex(c => c === color) === index);
  }
  return newColorArray.slice(0, numDistricts);
};

function hexshift(color: string): string {
  const hex = '0123456789ABCDEF';
  let sub = hex[Math.floor(Math.random() * 16)];
  let char = color[Math.floor(Math.random() * (color.length - 1)) + 1];

  while (sub === char) {
    sub = hex[Math.floor(Math.random() * 16)];
  }

  return color.replace(char, sub);
}

export function districtr(N: number): string[] {
  const colors = [
    '#0099cd',
    '#ffca5d',
    '#00cd99',
    '#99cd00',
    '#cd0099',
    '#9900cd',
    '#8dd3c7',
    '#bebada',
    '#fb8072',
    '#80b1d3',
    '#fdb462',
    '#b3de69',
    '#fccde5',
    '#bc80bd',
    '#ccebc5',
    '#ffed6f',
    '#ffffb3',
    '#a6cee3',
    '#1f78b4',
    '#b2df8a',
    '#33a02c',
    '#fb9a99',
    '#e31a1c',
    '#fdbf6f',
    '#ff7f00',
    '#cab2d6',
    '#6a3d9a',
    '#b15928',
    '#64ffda',
    '#00B8D4',
    '#A1887F',
    '#76FF03',
    '#DCE775',
    '#B388FF',
    '#FF80AB',
    '#D81B60',
    '#26A69A',
    '#FFEA00',
    '#6200EA',
  ];

  const repeats = Math.ceil(N / colors.length);
  const tail = colors.flatMap(color =>
    Array(repeats - 1)
      .fill(null)
      .map(() => hexshift(color))
  );
  return colors.concat(tail).slice(0, N);
}
