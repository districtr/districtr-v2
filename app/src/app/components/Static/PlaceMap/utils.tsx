import {listCMSContent, PlacesCMSContent} from '@/app/utils/api/cms';
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
  hovered: {name: string; abbr: string} | null;
  setHovered: (hovered: {name: string; abbr: string} | null) => void;
  mapsBySlug: Record<string, number>;
}>(set => ({
  data: null,
  mapsBySlug: {},
  getData: async () => {
    const [topology, content] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/sprites/usa-topo.json`).then(r => r.json()),
      listCMSContent('places') as Promise<PlacesCMSContent[]>,
    ]);
    const mapsBySlug = content?.reduce(
      (acc, place) => {
        acc[place.slug] = place.districtr_map_slugs?.length || 0;
        return acc;
      },
      {} as Record<string, number>
    );
    // @ts-expect-error
    const {features: unitedStates} = topojson.feature(topology, topology.objects.states) as {
      type: 'FeatureCollection';
      features: FeatureShape[];
    };
    set({data: unitedStates, mapsBySlug});
  },
  hovered: null,
  setHovered: hovered => set({hovered}),
}));
