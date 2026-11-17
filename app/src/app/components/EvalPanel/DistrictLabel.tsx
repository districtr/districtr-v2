'use client';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useZoneLabel} from '@/app/hooks/useZoneLabel';
import {useIsReport} from './evalMode';

interface DistrictLabelProps {
  zone: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const DistrictLabel: React.FC<DistrictLabelProps> = ({
  zone,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}) => {
  const getZoneColor = useZoneColorGetter();
  const color = getZoneColor(zone);
  const label = useZoneLabel(zone);
  const isReport = useIsReport();

  // A document names a district in plain text.
  if (isReport) return <span className="eval-report-district">{label}</span>;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      title={label}
      style={{
        // A circle for a short label; a pill, cut off past 12 characters, for longer.
        minWidth: 30,
        maxWidth: '12ch',
        height: 30,
        padding: '0 6px',
        borderRadius: 15,
        backgroundColor: '#fff',
        border: `2.5px solid ${color}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: 13,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
        {label}
      </span>
    </div>
  );
};
