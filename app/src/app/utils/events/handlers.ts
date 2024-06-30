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
    accumulatedGeoids: MutableRefObject<Set<string>>,
    db: duckdb.AsyncDuckDB,
  ) => {
    try {
      zoneStoreRef.setZoneAssignments(selectedZone, accumulatedGeoids.current);
      insertZoneAssignments(selectedZone, accumulatedGeoids.current, db);
    } finally {
      accumulatedGeoids.current.clear();
    }
  },
  50,
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
      accumulatedGeoids,
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
  // console.log(inserts);

  try {
    const c = await db.connect();
    // Hitting error inserting too many rows at once
    // https://github.com/duckdb/duckdb-wasm/issues/1477
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
