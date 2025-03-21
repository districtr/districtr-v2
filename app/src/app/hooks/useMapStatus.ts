import {useMapStore} from '../store/mapStore';
import {DocumentObject} from '../utils/api/apiHandlers';

export const useMapStatus = () => {
  const {status, access, document_id} = useMapStore(
    state => state.mapDocument ?? ({} as DocumentObject)
  );
  const mapMetadata = useMapStore(state => state.mapMetadata);
  
  if (!document_id) return null;
  if (status === 'locked' || access === 'read') return ': Frozen';
  if (!mapMetadata || mapMetadata.is_draft) return ': In Progress';
  return ': Ready to Share';
};
