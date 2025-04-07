import {MapStore} from '@/app/store/mapStore';

export type ShatterState = [
  MapStore['shatterIds'],
  MapStore['mapRenderingState'],
  MapStore['mapOptions']['activeLayers']['highlight-broken'],
];

export type FocusState = MapStore['focusFeatures'];
