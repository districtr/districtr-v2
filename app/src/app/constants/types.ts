import type {MapOptions, MapLibreEvent, MapGeoJSONFeature} from 'maplibre-gl';

export type Zone = number;
export type NullableZone = Zone | null;

export type GEOID = string;

export type GDBPath = string;

export type ZoneDict = Map<GEOID, Zone>;

export const ACTIVE_TOOLS = {
  PAN: 'pan',
  BRUSH: 'brush',
  ERASER: 'eraser',
  SHATTER: 'shatter',
  UNDO: 'undo',
  REDO: 'redo',
  INSPECTOR: 'inspector',
} as const;

export type ActiveTool = (typeof ACTIVE_TOOLS)[keyof typeof ACTIVE_TOOLS];

export type SpatialUnit = 'county' | 'tract' | 'block' | 'block_group' | 'voting_district'; // others?

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

export const ConflictContext = {
  Save: 'save',
  Load: 'load',
} as const;

export enum SyncConflictResolution {
  UseLocal = 'use-local',
  UseServer = 'use-server',
  KeepLocal = 'keep-local',
  Fork = 'fork',
}

export type ConflictResolutionOptions = {
  onNavigate?: (documentId: string) => void;
  onComplete?: () => void;
  context?: ConflictContext;
};

export type ConflictContext = (typeof ConflictContext)[keyof typeof ConflictContext];
