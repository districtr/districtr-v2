import {useMapStatus} from '@/app/hooks/useMapStatus';
import {IconButton, Tooltip} from '@radix-ui/themes';

export const EditStatus: React.FC = () => {
  const {StatusIcon, statusTooltip, statusColor, onClick} = useMapStatus();
  if (!StatusIcon || !statusColor || !statusTooltip) return null;
  return (
    <Tooltip content={statusTooltip}>
      <IconButton variant="ghost" size="1" color={statusColor} onClick={onClick ?? undefined}>
        <StatusIcon />
      </IconButton>
    </Tooltip>
  );
};
