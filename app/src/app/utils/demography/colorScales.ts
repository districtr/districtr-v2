import {
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {
  AllDemographyVariables,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_COLOR_SCHEME_GRAY,
} from '@/app/store/demographyStore';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import * as scale from 'd3-scale';
import { op } from 'arquero';

/**
 * Helper to manage the arqueo quantile function.
 */
export const getBinsFromQuantiles = ({
  variable,
  numberOfBins,
  table
}: {
  variable: AllDemographyVariables;
  numberOfBins: number;
  table: typeof demographyCache.table;
}) => {
  if (!table) return null
  const rollups = (new Array(numberOfBins+1)).fill(0)
    .map((f,i) => i === 0 ? i : Math.round((1/numberOfBins)*i*100)/100)
    .reduce((acc, curr, i) => {
      acc[`q${curr*100}`] = op.quantile(variable, curr);
      return acc
    }, {} as {[key: string]: ReturnType<typeof op.quantile>});
  const quantilesObject = table.rollup(rollups).objects()[0];
  const quantilesList = Object.values(quantilesObject).sort((a, b) => a - b).slice(1,-1);
  return {
    quantilesObject,
    quantilesList,
  }
}

/**
 * Generates a color scale for demographic data and applies it to the map.
 *
 * @param {Object} params - The parameters for generating the color scale.
 * @param {AllDemographyVariables} params.variable - The demographic variable to visualize.
 * @param {maplibregl.Map} params.mapRef - The reference to the map instance.
 * @param {MapStore['mapDocument']} params.mapDocument - The map document from the store.
 * @param {number} params.numberOfBins - The number of bins for the color scale.
 *
 * @returns {d3.ScaleThreshold<number, string> | undefined} The generated color scale or undefined if prerequisites are not met.
 */
export const getDemographyColorScale = ({
  variable,
  mapRef,
  mapDocument,
  numberOfBins,
}: {
  variable: AllDemographyVariables;
  mapRef: maplibregl.Map;
  mapDocument: MapStore['mapDocument'];
  numberOfBins: number;
}) => {
  if (!demographyCache.table) return;
  const dataValues = demographyCache.table.select('path', 'sourceLayer', variable).objects();
  const quantiles = getBinsFromQuantiles({variable, numberOfBins, table: demographyCache.table});
  const arrayValues = dataValues.map((row: any) => row[variable]);
  const dataSoureExists = mapRef.getSource(BLOCK_SOURCE_ID);
  if (!arrayValues.length || !mapRef || !mapDocument || !dataSoureExists || !quantiles) return;
  const mapMode = useMapStore.getState().mapOptions.showDemographicMap;
  const defaultColor =
    mapMode === 'side-by-side' ? DEFAULT_COLOR_SCHEME : DEFAULT_COLOR_SCHEME_GRAY;
  const uniqueQuantiles = Array.from(new Set(quantiles.quantilesList));
  const actualBinsLength = Math.min(numberOfBins, uniqueQuantiles.length+1)
  let colorscheme = defaultColor[Math.max(3, actualBinsLength)] as Iterable<number>;
  if (actualBinsLength < 3) {
    colorscheme = (colorscheme as any).slice(0, actualBinsLength);
  }
  const colorScale = scale
    .scaleThreshold()
    .domain(uniqueQuantiles)
    .range(colorscheme);

  dataValues.forEach((row: any, i) => {
    const id = row.path;
    const value = row[variable];
    if (!id || isNaN(value)) return;
    const color = colorScale(+value);

    mapRef.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        sourceLayer: row.sourceLayer,
        id,
      },
      {
        color,
        hasColor: true,
      }
    );
  });
  return colorScale;
};