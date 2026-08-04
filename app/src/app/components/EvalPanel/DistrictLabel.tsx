'use client';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

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
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
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
      {zone}
    </div>
  );
};
