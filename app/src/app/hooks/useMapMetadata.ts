import {useMapStore} from '../store/mapStore';

export const useMapMetadata = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  return mapDocument?.map_metadata || null;
};
