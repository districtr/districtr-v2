import type {MapOptions, MapLibreEvent, MapGeoJSONFeature} from 'maplibre-gl';

// we might not need this anymore- tk
export type ViewStateChangeEvent =
  | (MapLibreEvent<MouseEvent | TouchEvent | WheelEvent> & {
      type: 'movestart' | 'move' | 'moveend' | 'zoomstart' | 'zoom' | 'zoomend';
      viewState: MapOptions;
    })
  | (MapLibreEvent<MouseEvent | TouchEvent> & {
      type:
        | 'rotatestart'
        | 'rotate'
        | 'rotateend'
        | 'dragstart'
        | 'drag'
        | 'dragend'
        | 'pitchstart'
        | 'pitch'
        | 'pitchend';
      viewState: MapOptions;
    });

export type MapFeatureInfo = {
  source: string;
  sourceLayer?: string;
  id?: string | number;
} & Partial<MapGeoJSONFeature>;
