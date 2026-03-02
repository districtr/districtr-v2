import {useMemo} from 'react';
import {useMapStore} from '../store/mapStore';
import {STATUS_TOOLTIPS} from '../constants/notifications';
import {useMapMetadata} from './useMapMetadata';
import {BadgeProps} from '@radix-ui/themes';
import {useSearchParams} from 'next/navigation';
import {EyeOpenIcon, LockClosedIcon, LockOpen1Icon, Pencil2Icon} from '@radix-ui/react-icons';

export const useMapStatus = () => {
  const document_id = useMapStore(state => state.mapDocument?.document_id);
  const mapStatus = useMapStore(state => state.mapStatus);
  const access = mapStatus?.access;
  const mapMetadata = useMapMetadata();
  const pwRequired = useSearchParams().get('pw');

  const setPasswordPrompt = useMapStore(state => state.setPasswordPrompt);

  const [StatusIcon, statusTooltip, statusColor] = useMemo(() => {
    if (!document_id) return [() => null, null, null];
    if (pwRequired) {
      return [LockOpen1Icon, STATUS_TOOLTIPS.lockedWithPW, 'cyan'];
    }
    if (access === 'read') {
      return [EyeOpenIcon, STATUS_TOOLTIPS.viewOnly, 'blue'];
    }
    return [Pencil2Icon, STATUS_TOOLTIPS.editing, 'green'];
  }, [access, document_id, mapMetadata, pwRequired]) as [React.FC, string, BadgeProps['color']];

  const onClick = pwRequired ? () => setPasswordPrompt(true) : null;
  return {
    StatusIcon,
    statusTooltip,
    statusColor,
    onClick,
  };
};
