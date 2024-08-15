import type { Map, MapLayerEventType } from "maplibre-gl";
import maplibregl, {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { MutableRefObject } from "react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { MAP_OPTIONS } from "../constants/configuration";
import {
  mapEvents,
  useHoverFeatureIds,
  handleResetMapSelectState,
} from "../utils/events/mapEvents";
import { BLOCK_HOVER_LAYER_ID } from "../constants/layers";
import { useSearchParams } from "next/navigation";
import { useMapStore } from "../store/mapStore";
import {
  FormatAssignments,
  getDocument,
  DocumentObject,
  patchUpdateAssignments,
  AssignmentsCreate,
} from "../api/apiHandlers";
import { useMutation } from "@tanstack/react-query";

export const MapComponent: React.FC = () => {
  const searchParams = useSearchParams();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();

  const patchUpdates = useMutation({
    mutationFn: patchUpdateAssignments,
    onError: (error) => {
      console.log("Error updating assignments: ", error);
    },
    onSuccess: (data: AssignmentsCreate) => {
      console.log(
        `Successfully upserted ${data.assignments_upserted} assignments`,
      );
    },
  });

  const {
    freshMap,
    zoneAssignments,
    setMapDocument,
    setSelectedLayer,
    setMapRef,
  } = useMapStore((state) => ({
    freshMap: state.freshMap,
    zoneAssignments: state.zoneAssignments,
    setMapDocument: state.setMapDocument,
    setSelectedLayer: state.setSelectedLayer,
    setMapRef: state.setMapRef,
  }));

  useEffect(() => {
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  useEffect(() => {
    const document_id = searchParams.get("document_id");
    if (document_id && !useMapStore.getState().mapDocument) {
      getDocument(document_id).then((res: DocumentObject) => {
        setMapDocument(res);
      });
    }
  }, [searchParams, setMapDocument]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_OPTIONS.style,
      center: MAP_OPTIONS.center,
      zoom: MAP_OPTIONS.zoom,
      maxZoom: MAP_OPTIONS.maxZoom,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      setMapRef(map);
      const mapDocument = useMapStore.getState().mapDocument;
      if (mapDocument?.tiles_s3_path) {
        setSelectedLayer({
          name: mapDocument.gerrydb_table,
          tiles_s3_path: mapDocument.tiles_s3_path,
        });
      }
    });

    mapEvents.forEach((action) => {
      if (map.current) {
        map.current?.on(
          action.action as keyof MapLayerEventType,
          BLOCK_HOVER_LAYER_ID, // to be updated with the scale-agnostic layer id
          (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
            action.handler(e, map, hoverFeatureIds);
          },
        );
      }
    });

    return () => {
      mapEvents.forEach((action) => {
        map.current?.off(action.action, (e) => {
          action.handler(e, map, hoverFeatureIds);
        });
      });
    };
  });

  /**
   * send assignments to the server when zones change.
   */
  useEffect(() => {
    if (mapLoaded && map.current && zoneAssignments.size) {
      const assignments = FormatAssignments();
      patchUpdates.mutate(assignments);
    }
  }, [mapLoaded, zoneAssignments, patchUpdates]);

  useEffect(() => {
    if (mapLoaded && map.current) {
      handleResetMapSelectState(map);
    }
  }, [mapLoaded, freshMap]);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
