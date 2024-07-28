import type { MapOptions, MapLibreEvent } from "maplibre-gl";

export type Zone = number;

export type GEOID = string;

export type ZoneDict = Map<GEOID, Zone>;

export type ActiveTool = "pan" | "brush" | "eraser"; // others?

export type SpatialUnit =
  | "county"
  | "tract"
  | "block"
  | "block_group"
  | "voting_district"; // others?

// we might not need this anymore- tk
export type ViewStateChangeEvent =
  | (MapLibreEvent<MouseEvent | TouchEvent | WheelEvent> & {
      type: "movestart" | "move" | "moveend" | "zoomstart" | "zoom" | "zoomend";
      viewState: MapOptions;
    })
  | (MapLibreEvent<MouseEvent | TouchEvent> & {
      type:
        | "rotatestart"
        | "rotate"
        | "rotateend"
        | "dragstart"
        | "drag"
        | "dragend"
        | "pitchstart"
        | "pitch"
        | "pitchend";
      viewState: MapOptions;
    });
