import { PointLike } from "maplibre-gl";

export const boxAroundPoint = (
  point: PointLike,
  radius: number
): [PointLike, PointLike] => {
  return [
    [
      (point as [number, number])[0] - radius,
      (point as [number, number])[1] - radius,
    ],
    [
      (point as [number, number])[0] + radius,
      (point as [number, number])[1] + radius,
    ],
  ];
};
