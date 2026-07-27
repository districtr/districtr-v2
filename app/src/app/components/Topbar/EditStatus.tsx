import {useMapStatus} from '@/app/hooks/useMapStatus';
import {IconButton} from '@radix-ui/themes';
import {HelpTip} from '@components/HelpTip/HelpTip';

export const EditStatus: React.FC = () => {
  const {StatusIcon, statusTooltip, statusColor, onClick} = useMapStatus();
  if (!StatusIcon || !statusColor || !statusTooltip) return null;
  return (
    <HelpTip tip="mapAccessStatus" text={statusTooltip}>
      <IconButton
        variant="ghost"
        size="1"
        color={statusColor}
        onClick={onClick ?? undefined}
        aria-label={statusTooltip}
      >
        <StatusIcon />
      </IconButton>
    </HelpTip>
  );
};
