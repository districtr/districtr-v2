import { BLOCK_LAYER_ID, BLOCK_LAYER_SOURCE_ID } from "@/app/constants/layers";
import { MutableRefObject } from "react";
import type { Map, MapGeoJSONFeature } from "maplibre-gl";
import { ZoneStore } from "@/app/store/zoneStore";
import { debounce } from "lodash";
import * as duckdb from "@duckdb/duckdb-wasm";
import { Zone, GEOID } from "../../constants/types";

const debouncedSetZoneAssignments = debounce(
  (
    zoneStoreRef: { setZoneAssignments: (arg0: any, arg1: any) => void },
    selectedZone: any,
    geoids: any,
    db: duckdb.AsyncDuckDB,
  ) => {
    zoneStoreRef.setZoneAssignments(selectedZone, geoids);
    insertZoneAssignments(selectedZone, geoids, db);
  },
  1000, // 1 second
);

export const HighlightFeature = (
  features: Array<MapGeoJSONFeature> | undefined,
  map: MutableRefObject<Map | null>,
  zoneStoreRef: MutableRefObject<ZoneStore | null>,
  accumulatedGeoids: MutableRefObject<Set<string>>,
  db: MutableRefObject<duckdb.AsyncDuckDB | null>,
) => {
  features?.forEach((feature) => {
    map.current?.setFeatureState(
      {
        source: BLOCK_LAYER_ID,
        id: feature?.id ?? undefined,
        sourceLayer: BLOCK_LAYER_SOURCE_ID,
      },
      { hover: true, zone: Number(zoneStoreRef.selectedZone) },
    );
  });

  if (features?.length && db !== null) {
    features.forEach((feature) => {
      accumulatedGeoids.current.add(feature.properties?.GEOID20);
    });
  }

  if (db !== null) {
    debouncedSetZoneAssignments(
      zoneStoreRef,
      zoneStoreRef.selectedZone,
      accumulatedGeoids.current,
      db.current,
    );
  }
};

const insertZoneAssignments = async (
  zone: Zone,
  geoids: Array<GEOID>,
  db: duckdb.AsyncDuckDB,
) => {
  let inserts: string[] = [];
  geoids.forEach((geoid) => {
    inserts.push(`('${geoid}', ${zone})`);
  });

  try {
    const c = await db.connect();
    await c.query(
      `INSERT INTO
        assignments (geoid, zone)
        VALUES ${inserts.join(", ")}
        ON CONFLICT DO UPDATE SET zone = EXCLUDED.zone;`,
    );
  } catch (e) {
    console.error("Error inserting assignments", e);
  }
};

const unhighlightFeature = (
  map: MutableRefObject<Map | null>,
  highlightedFeature: MutableRefObject<number | null>,
  //   filterStoreRef: MutableRefObject<FilterStore | null>
) => {
  // TODO: need to update this to match logic in HighlightFeature

  if (highlightedFeature.current) {
    map.current?.setFeatureState(
      {
        source: BLOCK_LAYER_ID,
        id: highlightedFeature.current ?? undefined,
        sourceLayer: BLOCK_LAYER_SOURCE_ID,
      },
      { hover: false },
    );
  }
};
