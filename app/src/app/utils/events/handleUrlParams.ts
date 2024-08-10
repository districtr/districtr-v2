"use client";

import { useSearchParams } from "next/navigation";
import { useMapStore } from "@/app/store/mapStore";
import { useGetMapData } from "@/app/api/apiHandlers";

export const HandleUrlParams = () => {
  const searchParams = useSearchParams();
  const params = Object.fromEntries(searchParams.entries());

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
