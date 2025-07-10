import {VectorSourceSpecification} from 'maplibre-gl';
import {TILESET_URL} from '../utils/api/constants';

export function getBlocksSource(layer_subpath: string): VectorSourceSpecification {
  return {
    type: 'vector',
    url: `pmtiles://${TILESET_URL}/${layer_subpath}`,
    promoteId: 'path',
  };
}
