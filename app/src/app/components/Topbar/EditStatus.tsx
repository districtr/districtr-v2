import { useMapStatus } from '@/app/hooks/useMapStatus';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {EyeClosedIcon, EyeOpenIcon, LockClosedIcon, Pencil2Icon} from '@radix-ui/react-icons';
import {IconButton, Tooltip} from '@radix-ui/themes';

const EditStatusIcon: React.FC<{
  access?: DocumentObject['access'];
  status?: DocumentObject['status'];
}> = ({access, status}) => {
  switch (`${access}-${status}`) {
    case 'edit-locked':
      return <LockClosedIcon />;
    case 'edit-checked_out':
    case 'edit-unlocked':
      return <Pencil2Icon />;
    case 'read-locked':
    case 'read-unlocked':
    case 'read-checked_out':
      return <EyeOpenIcon />;
    default:
      return null;
  }
};

export const EditStatus: React.FC<{
  access?: DocumentObject['access'];
  status?: DocumentObject['status'];
}> = ({access, status}) => {
  const {statusTooltip} = useMapStatus();

  return (
    <Tooltip content={statusTooltip}>
      <IconButton variant="ghost" size="1">
        <EditStatusIcon access={access} status={status} />
      </IconButton>
    </Tooltip>
  );
};
