import type { Map, MapLayerEventType } from "maplibre-gl";
import maplibregl, {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { MutableRefObject } from "react";
import React, { useEffect, useRef, useState } from "react";
import { MAP_OPTIONS } from "../constants/configuration";
import {
  mapEvents,
  useHoverFeatureIds,
  handleResetMapSelectState,
} from "../utils/events/mapEvents";
import { BLOCK_HOVER_LAYER_ID, BLOCK_SOURCE_ID } from "../constants/layers";
import { useSearchParams } from "next/navigation";
import { useMapStore } from "../store/mapStore";
import {
  FormatAssignments,
  getDocument,
  DocumentObject,
  patchUpdateAssignments,
  AssignmentsCreate,
  getAssignments,
  Assignment,
  getZonePopulations,
} from "../api/apiHandlers";
import { useMutation, useQuery, skipToken } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

export const MapComponent: React.FC = () => {
  const searchParams = useSearchParams();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();

  const patchUpdates = useMutation({
    mutationFn: patchUpdateAssignments,
    onMutate: () => {
      console.log("Updating assignments");
    },
    onError: (error) => {
      console.log("Error updating assignments: ", error);
    },
    onSuccess: (data: AssignmentsCreate) => {
      console.log(
        `Successfully upserted ${data.assignments_upserted} assignments`
      );
      mapMetrics.refetch();
    },
  });

  const { activeTool, freshMap, zoneAssignments, mapDocument } = useMapStore(
    useShallow((state) => ({
      activeTool: state.activeTool,
      freshMap: state.freshMap,
      zoneAssignments: state.zoneAssignments,
      mapDocument: state.mapDocument,
    }))
  );

  const { setMapDocument, setSelectedLayer, setMapRef, setMapMetrics } =
    useMapStore(
      useShallow((state) => ({
        setMapDocument: state.setMapDocument,
        setSelectedLayer: state.setSelectedLayer,
        setMapRef: state.setMapRef,
        setMapMetrics: state.setMapMetrics,
      }))
    );
  const mapMetrics = useQuery({
    queryKey: ["zonePopulations", mapDocument],
    queryFn: mapDocument ? () => getZonePopulations(mapDocument) : skipToken,
  });

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
  }, [searchParams]);

  useEffect(() => {
    // measure how long this function takes
    console.time("set map metrics");
    setMapMetrics(mapMetrics);
    // measure how long this function takes
    console.timeEnd("set map metrics");
  }, [mapMetrics.data]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    console.time("create map");
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_OPTIONS.style,
      center: MAP_OPTIONS.center,
      zoom: MAP_OPTIONS.zoom,
      maxZoom: MAP_OPTIONS.maxZoom,
    });
    map.current.scrollZoom.setWheelZoomRate(1 / 300);
    map.current.scrollZoom.setZoomRate(1 / 300);

    map.current.addControl(new maplibregl.NavigationControl());
    console.timeEnd("create map");

    console.time("set map load event");
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

      if (mapDocument) {
        console.log("fetching assignments");
        const sourceLayer = mapDocument.gerrydb_table;
        getAssignments(mapDocument).then((res: Assignment[]) => {
          console.log("got", res.length, "assignments");
          mapMetrics.refetch();
          res.forEach((assignment) => {
            zoneAssignments.set(assignment.geo_id, assignment.zone);
            map.current?.setFeatureState(
              {
                source: BLOCK_SOURCE_ID,
                id: assignment.geo_id,
                sourceLayer: sourceLayer,
              },
              {
                selected: true,
                zone: assignment.zone,
              }
            );
          });
        });
      }
    });
    console.timeEnd("set map load event");

    console.time("set map actions");
    mapEvents.forEach((action) => {
      if (map.current) {
        map.current?.on(
          action.action as keyof MapLayerEventType,
          BLOCK_HOVER_LAYER_ID, // to be updated with the scale-agnostic layer id
          (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
            action.handler(e, map, hoverFeatureIds);
          }
        );
      }
    });
    console.timeEnd("set map actions");

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
      if (activeTool === "brush" || activeTool === "eraser") {
        const assignments = FormatAssignments();
        patchUpdates.mutate(assignments);
      }
    }
  }, [mapLoaded, zoneAssignments]);

  useEffect(() => {
    console.time("reset map select state");
    if (mapLoaded && map.current) {
      handleResetMapSelectState(map);
    }
    console.timeEnd("reset map select state");
  }, [mapLoaded, freshMap]);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
