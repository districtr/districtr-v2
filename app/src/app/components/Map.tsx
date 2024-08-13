import type { Map, MapLayerEventType } from "maplibre-gl";
import maplibregl, {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { MutableRefObject } from "react";
import React, { use, useEffect, useRef, useState } from "react";
import { MAP_OPTIONS } from "../constants/configuration";
import {
  mapEvents,
  useHoverFeatureIds,
  handleResetMapSelectState,
} from "../utils/events/mapEvents";
import { addBlockLayers, BLOCK_HOVER_LAYER_ID } from "../constants/layers";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMapStore } from "../store/mapStore";
import {
  usePatchUpdateAssignments,
  FormatAssignments,
  getDocument,
  useCreateMapDocument,
  DocumentObject,
} from "../api/apiHandlers";

export const MapComponent: React.FC = () => {
  const router = useRouter();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();
  const document = useCreateMapDocument();
  const patchUpdates = usePatchUpdateAssignments();
  const { freshMap, selectedLayer, setFreshMap, zoneAssignments } = useMapStore(
    (state) => ({
      freshMap: state.freshMap,
      selectedLayer: state.selectedLayer,
      setFreshMap: state.setFreshMap,
      zoneAssignments: state.zoneAssignments,
    }),
  );
  const searchParams = useSearchParams();
  const setRouter = useMapStore((state) => state.setRouter);
  const setPathname = useMapStore((state) => state.setPathname);
  const pathname = usePathname();

  /**
   * create a document_id when the user starts an edit session,
   * if one does not already exist
   *  */
  useEffect(() => {
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  useEffect(() => {
    // create a new document is one doesn't exist AND the document_id isn't in the url as a param
    console.log(selectedLayer);
    console.log(document);
    const documentId = document.data?.document_id;
    const urlDocumentId = searchParams.get("document_id");
    console.log("Document ID", documentId, "from URL", urlDocumentId);
    if (
      selectedLayer &&
      !documentId &&
      !urlDocumentId &&
      !document.isSuccess &&
      !document.isPending &&
      !document.isError
    ) {
      document.mutate({ gerrydb_table: selectedLayer.name });
    }
  }, [document, searchParams, selectedLayer]);

  useEffect(() => {
    const document_id = searchParams.get("document_id");
    console.log("BLEHHH", useMapStore.getState().documentId);
    if (document_id && !useMapStore.getState().documentId) {
      console.log("getting document", document_id);
      getDocument(document_id).then((res: DocumentObject) => {
        useMapStore.setState({ documentId: res.data });
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedLayer) {
      addBlockLayers(map, selectedLayer);
    }
  }, [selectedLayer]);

  useEffect(() => {
    setRouter(router);
    setPathname(pathname);
  }, [router, setRouter, pathname, setPathname]);

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

  useEffect(() => {
    // create a map document if the map is loaded and the uuid is not set via url
    if (
      mapLoaded &&
      map.current !== null &&
      !useMapStore.getState().documentId
    ) {
      useMapStore.setState({ mapRef: map });
    }
  }, [mapLoaded, map.current]);

  /**
   * send assignments to the server when zones change.
   * we may want to reconsider this based on
   */
  useEffect(() => {
    if (mapLoaded && map.current && zoneAssignments.size) {
      console.log("Assignments", zoneAssignments);
      const assignments = FormatAssignments();
      patchUpdates.mutate(assignments);
    }
  }, [mapLoaded, map.current, zoneAssignments]);

  useEffect(() => {
    if (mapLoaded && map.current) {
      handleResetMapSelectState(map);
    }
  }, [mapLoaded, map.current, freshMap]);

  return <div className="h-full w-full-minus-sidebar" ref={mapContainer} />;
};
