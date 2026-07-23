import {useMapStatus} from '@/app/hooks/useMapStatus';
import {IconButton} from '@radix-ui/themes';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';

export const EditStatus: React.FC = () => {
  const {StatusIcon, statusTooltip, statusColor, onClick} = useMapStatus();
  if (!StatusIcon || !statusColor || !statusTooltip) return null;
  return (
    <HelpTip tip="mapAccessStatus" openDelay={HELP_TIP_FAST_DELAY} text={statusTooltip}>
      <IconButton variant="ghost" size="1" color={statusColor} onClick={onClick ?? undefined}>
        <StatusIcon />
      </IconButton>
    </HelpTip>
  );
};
