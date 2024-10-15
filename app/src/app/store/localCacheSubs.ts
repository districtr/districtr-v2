import { DocumentObject } from "../utils/api/apiHandlers";
import { MapStore, useMapStore } from "./mapStore";

export const userMapsLocalStorageKey = "districtr-maps";

export const getLocalCacheSubs = (_useMapStore: typeof useMapStore) => {
  const _localStorageMapDocuments = _useMapStore.subscribe<
    MapStore["mapDocument"]
  >(
    (state) => state.mapDocument,
    (mapDocument) => {
      if (!mapDocument || !mapDocument.document_id) {
        return;
      }

      let districtrMaps = JSON.parse(
        localStorage.getItem(userMapsLocalStorageKey) || "[]"
      ) as DocumentObject[];

      const documentIndex = districtrMaps.findIndex(
        (f) => f.document_id === mapDocument.document_id
      );
      const documentInfo = useMapStore.getState().mapViews?.data?.find(view=>
        view.gerrydb_table_name === mapDocument.gerrydb_table
      )
      
      if (documentIndex !== -1) {
        districtrMaps[documentIndex] = {
          ...documentInfo,
          ...districtrMaps[documentIndex],
          ...mapDocument,
        };
      } else {
        districtrMaps = [{...mapDocument, ...documentInfo}, ...districtrMaps];
      }
      localStorage.setItem(
        userMapsLocalStorageKey,
        JSON.stringify(districtrMaps)
      );
    }
  );

  return [
    _localStorageMapDocuments
  ]
};
