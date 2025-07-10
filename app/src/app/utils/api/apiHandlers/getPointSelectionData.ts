import ParquetWorker from '../../ParquetWorker';

export const getPointSelectionData = async ({
  layer,
  columns,
  filterIds,
  source,
}: {
  layer: string;
  columns: string[];
  source: string;
  filterIds?: Set<string>;
}): Promise<GeoJSON.FeatureCollection<GeoJSON.Point>> => {
  if (!layer) {
    throw new Error('No layer provided');
  }
  if (!ParquetWorker) {
    throw new Error('ParquetWorker not found');
  }

  return await ParquetWorker.getPointData(layer, columns, source, filterIds);
};
