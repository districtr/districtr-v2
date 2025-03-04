import {
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {
  AllDemographyVariables,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_COLOR_SCHEME_GRAY,
} from '@/app/store/demographicMap';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import * as scale from 'd3-scale';
import { op } from 'arquero';

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

export const getDemographyColorScale = ({
  variable,
  mapRef,
  shatterIds,
  mapDocument,
  numberOfBins,
}: {
  variable: AllDemographyVariables;
  mapRef: maplibregl.Map;
  shatterIds: MapStore['shatterIds'];
  mapDocument: MapStore['mapDocument'];
  numberOfBins: number;
}) => {
  if (!demographyCache.table) return;
  const dataValues = demographyCache.table.select('path', 'sourceLayer', variable).objects();
  const quantiles = getBinsFromQuantiles({variable, numberOfBins, table: demographyCache.table});
  const arrayValues = dataValues.map((row: any) => row[variable]);
  const dataSoureExists = mapRef.getSource(BLOCK_SOURCE_ID);
  if (!arrayValues.length || !mapRef || !mapDocument || !dataSoureExists || !quantiles) return;
  // const quantileValues = Object.values(quantiles[0])
  // const config = demographyVariables.find(f => f.value === variable.replace('_pct', ''));
  const mapMode = useMapStore.getState().mapOptions.showDemographicMap;
  const defaultColor =
    mapMode === 'side-by-side' ? DEFAULT_COLOR_SCHEME : DEFAULT_COLOR_SCHEME_GRAY;
  const colorscheme = defaultColor[numberOfBins] as Iterable<number>;

  const colorScale = scale
    .scaleThreshold()
    .domain(quantiles.quantilesList)
    .range(colorscheme);

  dataValues.forEach((row: any, i) => {
    const id = row.path;
    const value = row[variable];
    if (!id || !value) return;
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