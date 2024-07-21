import {
  Map,
  PointLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import { MutableRefObject } from "react";
import { usePostMapData } from "@/app/api/apiHandlers";

export const boxAroundPoint = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  radius: number
): [PointLike, PointLike] => {
  return [
    [e.point.x - radius, e.point.y - radius],
    [e.point.x + radius, e.point.y + radius],
  ];
};

export const SaveMap = (map: MutableRefObject<Map | null>) => {
  const postMapData = usePostMapData();
  if (map.current) {
    postMapData.mutate(map.current);
  }
};
