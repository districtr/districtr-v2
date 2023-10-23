import tinycolor from "tinycolor2";

/**
 * Global Districtr color map for districts.
 *
 * We might consider using fewer colors and just allowing repetitions,
 * since a human being can only hold so many colors in their head at
 * one time.
 *
 * Historically, colors are assigned randomly. Not too sure if the potential
 * for neighboring districts to have matching colors is entirely nonexistent.
 *
 * @see Original Districtr Reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/latest/src/colors.js#L8}
 * @see Example Usage : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/latest/src/map/NumberMarkers.js#L63}
 * @see HoverHex Generation : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/latest/src/colors.js#L78}
 */
const colorScheme = [
  { id: 0, hex: "#0099cd", hoverHex: "#006b90" },
  { id: 1, hex: "#ffca5d", hoverHex: "#b38d41" },
  { id: 2, hex: "#00cd99", hoverHex: "#00906b" },
  { id: 3, hex: "#99cd00", hoverHex: "#6b9000" },
  { id: 4, hex: "#cd0099", hoverHex: "#90006b" },
  { id: 5, hex: "#aa44ef", hoverHex: "#7730a7" },
  { id: 6, hex: "#8dd3c7", hoverHex: "#63948b" },
  { id: 7, hex: "#bebada", hoverHex: "#858299" },
  { id: 8, hex: "#fb8072", hoverHex: "#b05a50" },
  { id: 9, hex: "#80b1d3", hoverHex: "#5a7c94" },
  { id: 10, hex: "#fdb462", hoverHex: "#b17e45" },
  { id: 11, hex: "#b3de69", hoverHex: "#7d9b4a" },
  { id: 12, hex: "#fccde5", hoverHex: "#b090a0" },
  { id: 13, hex: "#bc80bd", hoverHex: "#845a84" },
  { id: 14, hex: "#ccebc5", hoverHex: "#8fa58a" },
  { id: 15, hex: "#ffed6f", hoverHex: "#b3a64e" },
  { id: 16, hex: "#ffffb3", hoverHex: "#b3b37d" },
  { id: 17, hex: "#a6cee3", hoverHex: "#74909f" },
  { id: 18, hex: "#1f78b4", hoverHex: "#16547e" },
  { id: 19, hex: "#b2df8a", hoverHex: "#7d9c61" },
  { id: 20, hex: "#33a02c", hoverHex: "#24701f" },
  { id: 21, hex: "#fb9a99", hoverHex: "#b06c6b" },
  { id: 22, hex: "#e31a1c", hoverHex: "#9f1214" },
  { id: 23, hex: "#fdbf6f", hoverHex: "#b1864e" },
  { id: 24, hex: "#ff7f00", hoverHex: "#b35900" },
  { id: 25, hex: "#cab2d6", hoverHex: "#8d7d96" },
  { id: 26, hex: "#6a3d9a", hoverHex: "#4a2b6c" },
  { id: 27, hex: "#b15928", hoverHex: "#7c3e1c" },
  { id: 28, hex: "#64ffda", hoverHex: "#46b399" },
  { id: 29, hex: "#00B8D4", hoverHex: "#008194" },
  { id: 30, hex: "#A1887F", hoverHex: "#715f59" },
  { id: 31, hex: "#76FF03", hoverHex: "#53b302" },
  { id: 32, hex: "#DCE775", hoverHex: "#9aa252" },
  { id: 33, hex: "#B388FF", hoverHex: "#7d5fb3" },
  { id: 34, hex: "#FF80AB", hoverHex: "#b35a78" },
  { id: 35, hex: "#D81B60", hoverHex: "#971343" },
  { id: 36, hex: "#26A69A", hoverHex: "#1b746c" },
  { id: 37, hex: "#FFEA00", hoverHex: "#b3a400" },
  { id: 38, hex: "#6200EA", hoverHex: "#4500a4" },
  { id: 39, hex: "#006b90", hoverHex: "#004b65" },
  { id: 40, hex: "#b38d41", hoverHex: "#7d632e" },
  { id: 41, hex: "#00906b", hoverHex: "#00654b" },
  { id: 42, hex: "#6b9000", hoverHex: "#4b6500" },
  { id: 43, hex: "#90006b", hoverHex: "#65004b" },
  { id: 44, hex: "#7730a7", hoverHex: "#532275" },
  { id: 45, hex: "#63948b", hoverHex: "#456861" },
  { id: 46, hex: "#858299", hoverHex: "#5d5b6b" },
  { id: 47, hex: "#b05a50", hoverHex: "#7b3f38" },
  { id: 48, hex: "#5a7c94", hoverHex: "#3f5768" },
  { id: 49, hex: "#b17e45", hoverHex: "#7c5830" },
  { id: 50, hex: "#7d9b4a", hoverHex: "#586d34" },
  { id: 51, hex: "#b090a0", hoverHex: "#7b6570" },
  { id: 52, hex: "#845a84", hoverHex: "#5c3f5c" },
  { id: 53, hex: "#8fa58a", hoverHex: "#647461" },
  { id: 54, hex: "#b3a64e", hoverHex: "#7d7437" },
  { id: 55, hex: "#b3b37d", hoverHex: "#7d7d58" },
  { id: 56, hex: "#74909f", hoverHex: "#51656f" },
  { id: 57, hex: "#16547e", hoverHex: "#0f3b58" },
  { id: 58, hex: "#7d9c61", hoverHex: "#586d44" },
  { id: 59, hex: "#24701f", hoverHex: "#194e16" },
  { id: 60, hex: "#b06c6b", hoverHex: "#7b4c4b" },
  { id: 61, hex: "#9f1214", hoverHex: "#6f0d0e" },
  { id: 62, hex: "#b1864e", hoverHex: "#7c5e37" },
  { id: 63, hex: "#b35900", hoverHex: "#7d3e00" },
  { id: 64, hex: "#8d7d96", hoverHex: "#635869" },
  { id: 65, hex: "#4a2b6c", hoverHex: "#341e4c" },
  { id: 66, hex: "#7c3e1c", hoverHex: "#572b14" },
  { id: 67, hex: "#46b399", hoverHex: "#317d6b" },
  { id: 68, hex: "#008194", hoverHex: "#005a68" },
  { id: 69, hex: "#715f59", hoverHex: "#4f433e" },
  { id: 70, hex: "#53b302", hoverHex: "#3a7d01" },
  { id: 71, hex: "#9aa252", hoverHex: "#6c7139" },
  { id: 72, hex: "#7d5fb3", hoverHex: "#58437d" },
  { id: 73, hex: "#b35a78", hoverHex: "#7d3f54" },
  { id: 74, hex: "#971343", hoverHex: "#6a0d2f" },
  { id: 75, hex: "#1b746c", hoverHex: "#13514c" },
  { id: 76, hex: "#b3a400", hoverHex: "#7d7300" },
  { id: 77, hex: "#4500a4", hoverHex: "#300073" },
];

export const tinyColorScheme = colorScheme.map((colorObj) => {
  const { id, hex, hoverHex } = colorObj;
  return {
    id,
    regular: tinycolor(hex),
    hover: tinycolor(hoverHex),
  };
});
