import {useMemo} from 'react';
import {useMapStore} from '../store/mapStore';
import {FROZEN_CONDITIONS, STATUS_TEXT} from '../constants/notifications';

export const useMapStatus = () => {
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const mapStatus = useMapStore(state => state.mapStatus);
  const status = mapStatus?.status;
  const access = mapStatus?.access;

  const mapMetadata = useMapStore(state => state.mapMetadata);
  const statusText = useMemo(() => {
    if (!document_id) return null;
    if (status === 'locked' || access === 'read') return STATUS_TEXT.frozen;
    if (!mapMetadata || mapMetadata.is_draft) return STATUS_TEXT.progress;
    return STATUS_TEXT.ready;
  }, [status, access, document_id, mapMetadata]);

  const frozenMessage = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const shareUrl = new URL(window.location.toString()).searchParams.get('share');
    if (status === 'locked' && access === 'edit' && shareUrl) {
      return FROZEN_CONDITIONS.lockedWithPW;
    }
    if (status === 'locked' && access === 'edit') {
      return FROZEN_CONDITIONS.checkedOut;
    }
    if (access === 'read') {
      return FROZEN_CONDITIONS.viewOnly;
    }
    return null;
  }, [access, status]);

  return {
    statusText,
    frozenMessage,
  };
};
