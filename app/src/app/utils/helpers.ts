import {
  Map,
  PointLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import { MutableRefObject } from "react";
import { Point } from "maplibre-gl";
export const boxAroundPoint = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  radius: number,
): [PointLike, PointLike] => {
  return [
    [e.point.x - radius, e.point.y - radius],
    [e.point.x + radius, e.point.y + radius],
  ];
};

export const mousePos = (
  map: MutableRefObject<Map | null>,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
) => {
  const canvas = map.current?.getCanvasContainer();
  if (!canvas) return new Point(0, 0);
  const rect = canvas.getBoundingClientRect();
  return new Point(
    e.point.x - rect.left - canvas.clientLeft,
    e.point.y - rect.top - canvas.clientTop,
  );
};
