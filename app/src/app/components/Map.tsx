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
import { addBlockLayers, BLOCK_HOVER_LAYER_ID } from "../constants/layers";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMapStore } from "../store/mapStore";
import {
  FormatAssignments,
  getDocument,
  DocumentObject,
  createMapDocument,
  patchUpdateAssignments,
  AssignmentsCreate,
} from "../api/apiHandlers";
import { useMutation } from "@tanstack/react-query";
import { SetUpdateUrlParams } from "../utils/events/mapEvents";

export const MapComponent: React.FC = () => {
  const router = useRouter();
  const map: MutableRefObject<Map | null> = useRef(null);
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hoverFeatureIds = useHoverFeatureIds();

  const document = useMutation({
    mutationFn: createMapDocument,
    onMutate: () => {
      console.log("creating map document");
    },
    onError: (error) => {
      console.error("Error creating map document: ", error);
    },
    onSuccess: (data) => {
      useMapStore.setState({ mapDocument: data });
      urlParams.set("document_id", data.document_id);
      SetUpdateUrlParams(router, pathname, urlParams);
    },
  });

  const patchUpdates = useMutation({
    mutationFn: patchUpdateAssignments,
    onMutate: () => {
      console.log("updating assignments");
    },
    onError: (error) => {
      console.log("Error updating assignments: ", error);
    },
    onSuccess: (data: AssignmentsCreate) => {
      console.log(
        `Successfully upserted ${data.assignments_upserted} assignments`,
      );
    },
  });

  const { freshMap, selectedLayer, zoneAssignments, urlParams } = useMapStore(
    (state) => ({
      freshMap: state.freshMap,
      selectedLayer: state.selectedLayer,
      zoneAssignments: state.zoneAssignments,
      urlParams: state.urlParams,
    }),
  );
  const searchParams = useSearchParams();
  const setRouter = useMapStore((state) => state.setRouter);
  const setPathname = useMapStore((state) => state.setPathname);
  const pathname = usePathname();

  useEffect(() => {
    let protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  useEffect(() => {
    if (selectedLayer) {
      addBlockLayers(map, selectedLayer);
      if (selectedLayer?.name !== document.data?.gerrydb_table) {
        document.mutate({ gerrydb_table: selectedLayer.name });
      }
    }
  }, [selectedLayer]);

  useEffect(() => {
    const document_id = searchParams.get("document_id");
    if (document_id && !useMapStore.getState().mapDocument) {
      console.log("getting document", document_id);
      getDocument(document_id).then((res: DocumentObject) => {
        useMapStore.setState({ mapDocument: res }); // setting storeDocument
      });
    }
  }, [searchParams]);

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
      !useMapStore.getState().mapDocument
    ) {
      useMapStore.setState({ mapRef: map });
    }
  }, [mapLoaded, map.current]);

  /**
   * send assignments to the server when zones change.
   */
  useEffect(() => {
    if (mapLoaded && map.current && zoneAssignments.size) {
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
