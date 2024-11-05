import {VectorSourceSpecification} from 'maplibre-gl';

export function getBlocksSource(
  layer_subpath: string
): VectorSourceSpecification {

  return {
    type: "vector",
    tiles: [typeof window === 'undefined' ? '' : `${window.location.origin}/api/tiles/${encodeURIComponent(layer_subpath)}/{z}/{x}/{y}`],
    promoteId: "path",
  };
}
