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

  const pointsData = await fetch('/api/points', {
    method: 'POST',
    body: JSON.stringify({layer, columns, source, filterIds}),
  });
  const pointsDataJson = await pointsData.json();
  return pointsDataJson;
};
