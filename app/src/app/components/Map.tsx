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
  handleResetMapSelectState,
} from "../utils/events/mapEvents";
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_SOURCE_ID,
  INTERACTIVE_LAYERS,
} from "../constants/layers";
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

export const MapComponent: React.FC = () => {
  const searchParams = useSearchParams();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapLock = useMapStore((state) => state.mapLock);

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
  const freshMap = useMapStore((state) => state.freshMap);
  const zoneAssignments = useMapStore((state) => state.zoneAssignments);
  const loadZoneAssignments = useMapStore((state) => state.loadZoneAssignments);

  const mapDocument = useMapStore((state) => state.mapDocument);
  const setMapDocument = useMapStore((state) => state.setMapDocument);
  const setMapRef = useMapStore((state) => state.setMapRef);
  const setMapMetrics = useMapStore((state) => state.setMapMetrics);

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
  }, [searchParams, setMapDocument]);

  useEffect(() => {
    setMapMetrics(mapMetrics);
  }, [mapMetrics.data]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

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

    map.current.on("load", () => {
      setMapLoaded(true);
      setMapRef(map);
      const mapDocument = useMapStore.getState().mapDocument;

      if (mapDocument) {
        console.log("fetching assignments");
        getAssignments(mapDocument).then((res: Assignment[]) => {
          console.log("got", res.length, "assignments");
          loadZoneAssignments(res);
        });
      }
    });
    INTERACTIVE_LAYERS.forEach((layer) => {
      mapEvents.forEach((action) => {
        if (map.current) {
          map.current?.on(
            action.action as keyof MapLayerEventType,
            layer, // to be updated with the scale-agnostic layer id
            (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
              action.handler(e, map);
            }
          );
        }
      });
    });

    return () => {
      mapEvents.forEach((action) => {
        map.current?.off(action.action, (e) => {
          action.handler(e, map);
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
  }, [mapLoaded, zoneAssignments]);

  useEffect(() => {
    if (mapLoaded && map.current) {
      handleResetMapSelectState(map);
    }
  }, [mapLoaded, freshMap]);

  return (
    <div
      className={`h-full w-full-minus-sidebar relative
    ${mapLock ? "pointer-events-none" : ""}
    `}
      ref={mapContainer}
    />
  );
};
