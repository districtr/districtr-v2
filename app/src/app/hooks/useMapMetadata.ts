import {useMapStore} from '../store/mapStore';

export const useMapMetadata = (document_id: string | undefined) => {
  const mapMetadata = useMapStore(
    state =>
      state.userMaps.find(userMap => userMap.document_id === document_id)?.map_metadata || null
  );

  return mapMetadata;
};
