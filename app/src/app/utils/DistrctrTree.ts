import { type MapStore } from "../store/mapStore";
import RBush from "rbush";
import * as papa from "papaparse";

export type StandardRBushItem = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  [_: string]: unknown;
};

class DistrictrTree extends RBush<StandardRBushItem> {
  mapRef?: MapStore["mapRef"];
  childData: StandardRBushItem[] | undefined;
  loaded: {
    parentLayer?: string;
    childLayer?: string;
  } = {};

  loadPoints<T extends StandardRBushItem>(
    points: T[],
    xCol: keyof T,
    yCol: keyof T
  ) {
    const cleanedPoints = points.map((point) => ({
      ...point,
      maxX: point[xCol],
      maxY: point[yCol],
      minX: point[xCol],
      minY: point[yCol],
    }))
    super.load(cleanedPoints);
  }

  setMap(mapRef: MapStore["mapRef"]) {
    this.mapRef = mapRef;
  }

  queryPoints(point: { x: number; y: number }, radius: number = 50) {
    if (!this.mapRef?.current) {
      return [];
    }

    const latLons = [
      this.mapRef?.current?.unproject([point.x - radius, point.y - radius]),
      this.mapRef?.current?.unproject([point.x + radius, point.y + radius]),
    ];

    if (latLons.some((point) => !point)) {
      return [];
    }

    const searchBbox = {
      minX: latLons[0]!.lng,
      minY: latLons[1]!.lat,
      maxX: latLons[1]!.lng,
      maxY: latLons[0]!.lat,
    };

    return super.search(searchBbox);
  }

  loadChildIds(currentShatterIds: string[], previousShatterIds: string[]) {
    const dataToLoad = this.childData?.filter(
      (row: any) =>
        currentShatterIds.includes(row.path) &&
        !previousShatterIds.includes(row.path)
    )
    dataToLoad?.length && this.loadPoints(dataToLoad, "x", "y");
  }

  async loadLayers(parentLayer: string, childLayer?: string) {
    if (
      parentLayer === this.loaded.parentLayer &&
      childLayer === this.loaded.childLayer
    ) {
      return;
    }

    this.loaded = { parentLayer, childLayer };
    super.clear();
    const [_loadedParentData, childData] = await Promise.all([
      this.fetchData(parentLayer, true),
      childLayer
        ? this.fetchData(childLayer)
        : {
            data: undefined,
          },
    ]);

    this.childData = childData?.data;
  }

  async fetchData(csvpath: string, load = false) {
    const csvData = await fetch(csvpath)
      .then((r) => r.text())
      .then((r) => papa.parse<StandardRBushItem>(r, { dynamicTyping: true, header: true }));
    if (load) {
      this.loadPoints(csvData.data, "x", "y");
    }
    return csvData;
  }
}

export const tree = new DistrictrTree();