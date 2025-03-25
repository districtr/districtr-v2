import {MapStore} from '@/app/store/mapStore';

export type ShatterState = [
  MapStore['shatterIds'],
  MapStore['mapRenderingState'],
  MapStore['mapOptions']['highlightBrokenDistricts'],
];

export type FocusState = MapStore['focusFeatures'];
