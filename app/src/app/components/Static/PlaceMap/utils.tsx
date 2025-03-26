import * as topojson from 'topojson-client';
import {create} from 'zustand';

export interface FeatureShape {
  type: 'Feature';
  id: string;
  geometry: {coordinates: [number, number][][]; type: 'Polygon'};
  properties: {name: string};
}

export const usePlaceMapStore = create<{
  data: FeatureShape[] | null;
  getData: () => void;
}>(set => ({
  data: null,
  getData: async () => {
    const topology = await fetch('/data/usa-topo.json').then(r => r.json());
    // @ts-expect-error
    const {features: unitedStates} = topojson.feature(topology, topology.objects.states) as {
      type: 'FeatureCollection';
      features: FeatureShape[];
    };
    set({data: unitedStates});
  },
}));
