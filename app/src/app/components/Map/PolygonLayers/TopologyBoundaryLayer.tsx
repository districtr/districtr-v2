'use client';
import {useEffect} from 'react';
import type {GeoJSONSource} from 'maplibre-gl';
import {Layer, Source} from 'react-map-gl/maplibre';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {boundaryArcs, boundaryDiff, unitAssignment} from '@utils/topology/boundaries';
import {getTopology, subscribeTopology} from '@utils/topology/state';

const SOURCE_ID = 'topology-boundaries';
// One object for the source's lifetime: a new `data` prop would make react-map-gl setData
// over the diffs.
const EMPTY = {type: 'FeatureCollection', features: []} as GeoJSON.FeatureCollection;

/**
 * District boundaries from the client topology (topology-parquet prototype): arcs whose two
 * active sides are in different zones, diffed into a GeoJSON source after each committed
 * change (gesture end, undo/redo, shatter/heal).
 */
export const TopologyBoundaryLayer: React.FC = () => {
  useEffect(() => {
    let shown = new Set<number>();
    const update = () => {
      const topo = getTopology();
      const source = useMapStore.getState().getMapRef()?.getSource(SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!topo || !source) return;
      const t0 = performance.now();
      const {zoneAssignments} = useAssignmentsStore.getState();
      const next = boundaryArcs(topo, unitAssignment(topo, zoneAssignments));
      const diff = boundaryDiff(topo, shown, next);
      source.updateData(diff);
      shown = next;
      performance.measure('districtr:topology-boundaries', {
        start: t0,
        detail: {arcs: next.size, add: diff.add?.length, remove: diff.remove?.length},
      });
    };
    update();
    const unsubscribes = [
      subscribeTopology(update),
      useAssignmentsStore.subscribe(state => state.zoneAssignments, update),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, []);

  return (
    <Source id={SOURCE_ID} type="geojson" data={EMPTY}>
      <Layer
        id={SOURCE_ID}
        type="line"
        source={SOURCE_ID}
        beforeId={MAP_LAYER_ANCHOR_IDS.countyBoundaries}
        paint={{
          'line-color': '#222',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.5],
        }}
      />
    </Source>
  );
};
