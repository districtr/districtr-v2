import {useMemo} from 'react';
import {useMapStore} from '../store/mapStore';
import {FROZEN_CONDITIONS, STATUS_TEXT, STATUS_TOOLTIPS} from '../constants/notifications';
import {useMapMetadata} from './useMapMetadata';
import {BadgeProps} from '@radix-ui/themes';

export const useMapStatus = () => {
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const mapStatus = useMapStore(state => state.mapStatus);
  const status = mapStatus?.status;
  const access = mapStatus?.access;
  const mapMetadata = useMapMetadata(document_id);
  const shareUrl = new URL(window.location.toString()).searchParams.get('share');

  const [statusText, statusTooltip, statusColor] = useMemo(() => {
    if (!document_id) return [null, null, null];
    if (status === 'locked' && access === 'edit' && shareUrl) {
      return [STATUS_TEXT.sharedWithPw, STATUS_TOOLTIPS.lockedWithPW, 'cyan'];
    }
    if (status === 'locked' && access === 'edit') {
      return [STATUS_TEXT.checkedOut, STATUS_TOOLTIPS.checkedOut, 'bronze'];
    }
    if (status === 'locked' && access === 'read') {
      return [STATUS_TEXT.frozen, STATUS_TOOLTIPS.viewOnly, 'blue'];
    }
    if (status === 'locked') return [STATUS_TEXT.frozen, STATUS_TOOLTIPS.viewOnly, 'blue'];
    if (!mapMetadata || !mapMetadata.draft_status) return [STATUS_TEXT.start, null, 'blue'];
    if (mapMetadata.draft_status === 'scratch') return [STATUS_TEXT.scratch, null, 'gray'];
    if (mapMetadata.draft_status === 'in_progress') return [STATUS_TEXT.progress, null, 'blue'];
    return [STATUS_TEXT.ready, null, 'green'];
  }, [mapStatus, status, access, document_id, mapMetadata]) as [string, string, BadgeProps['color']];

  const frozenMessage = useMemo(() => {
    if (typeof window === 'undefined') return null;
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
  }, [mapStatus, access, status]);

  return {
    statusText,
    statusTooltip,
    statusColor,
    frozenMessage,
  };
};
