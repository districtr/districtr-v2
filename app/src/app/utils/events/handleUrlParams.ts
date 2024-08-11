"use client";

import { useSearchParams } from "next/navigation";
import { useMapStore } from "@/app/store/mapStore";
import { getGerryDBViews, useGetMapData } from "@/app/api/apiHandlers";

export const HandleUrlParams = () => {
  const searchParams = useSearchParams();
  const params = Object.fromEntries(searchParams.entries());

  // if layer in search params, set layer in store
  if (
    params.layer &&
    useMapStore.getState().selectedLayer?.name !== params.layer
  ) {
    // get the gerrydb view based on the layer string
    getGerryDBViews().then((views) => {
      const selectedLayer = views.find((view) => view.name === params.layer);
      if (selectedLayer) {
        useMapStore.setState({ selectedLayer: selectedLayer });
      }
    });
  }

  // if document_id in search params, set document_id in store
  if (
    params.document_id &&
    useMapStore.getState().documentId !== params.document_id
  ) {
    useMapStore.setState({ documentId: params.document_id });
  }

  useGetMapData();

  return params;
};
