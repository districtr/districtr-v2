import {useMemo} from 'react';
import {useMapStore} from '../store/mapStore';
import {STATUS_TEXT, STATUS_TOOLTIPS} from '../constants/notifications';
import {useMapMetadata} from './useMapMetadata';
import {BadgeProps} from '@radix-ui/themes';
import {useSearchParams} from 'next/navigation';
import {useShareJwt} from './useShareJwt';
import {EyeOpenIcon, LockClosedIcon, LockOpen1Icon, Pencil2Icon} from '@radix-ui/react-icons';

export const useMapStatus = () => {
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const mapStatus = useMapStore(state => state.mapStatus);
  const status = mapStatus?.status;
  const access = mapStatus?.access;
  const mapMetadata = useMapMetadata(document_id);
  const shareUrl = useSearchParams().get('share');
  const shareToken = useShareJwt();
  const setPasswordPrompt = useMapStore(state => state.setPasswordPrompt);

  const [StatusIcon, statusTooltip, statusColor] = useMemo(() => {
    if (!document_id) return [() => null, null, null];
    if (shareToken?.password_required) {
      return [LockOpen1Icon, STATUS_TOOLTIPS.lockedWithPW, 'cyan'];
    }
    if (access === 'read') {
      return [EyeOpenIcon, STATUS_TOOLTIPS.viewOnly, 'blue'];
    }
    if (status === 'locked' && access === 'edit') {
      return [LockClosedIcon, STATUS_TOOLTIPS.checkedOut, 'bronze'];
    }
    return [Pencil2Icon, STATUS_TOOLTIPS.editing, 'green'];
  }, [status, access, document_id, mapMetadata, shareUrl]) as [
    React.FC,
    string,
    BadgeProps['color'],
  ];

  const onClick = shareToken?.password_required ? () => setPasswordPrompt(true) : null;
  return {
    StatusIcon,
    statusTooltip,
    statusColor,
    onClick,
  };
};
