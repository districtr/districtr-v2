import {MapStore} from '@/app/store/mapStore';
import {MapControlsStore} from '@/app/store/mapControlsStore';
import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {AssignmentsStore, ZoneAssignmentsMap} from '@/app/store/assignmentsStore';

export type ShatterState = [
  AssignmentsStore['shatterIds'],
  MapStore['mapRenderingState'],
  MapControlsStore['mapOptions']['highlightBrokenDistricts'],
];

export type FocusState = MapStore['focusFeatures'];

/**
 * PaintEventHandler
 * A function that takes a map reference, a map event object, and a brush size.
 * @param map - Map | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 */
export type PaintEventHandler = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  layers?: string[],
  filterLocked?: boolean
) => MapGeoJSONFeature[] | undefined;

export type TooltipState = {
  x: number;
  y: number;
  data: Array<{label: string; value: unknown}>;
};

export type ColorZoneAssignmentsState = [
  ZoneAssignmentsMap,
  MapStore['mapDocument'],
  AssignmentsStore['shatterIds'],
  MapStore['appLoadingState'],
  MapStore['mapRenderingState'],
  MapControlsStore['mapOptions']['lockPaintedAreas'],
  MapControlsStore['mapOptions']['showZoneNumbers'],
];
