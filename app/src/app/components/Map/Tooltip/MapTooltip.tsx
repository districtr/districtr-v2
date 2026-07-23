'use client';
import {Box, Popover, Text} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {InspectorTooltip} from '@components/Map/Tooltip/InspectorTooltip';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneDescriptionTooltip} from './ZoneDescriptionTooltip';
import {NUMBER_FORMATS} from '@constants/demography/format';

export const MapTooltip = () => {
  const tooltip = useTooltipStore(state => state.tooltip);
  const zoneDescriptionTooltip = useTooltipStore(state => state.zoneDescriptionTooltip);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const isInspectorMode = activeTool === ACTIVE_TOOLS.INSPECTOR;

  // Render zone description tooltip if active
  if (zoneDescriptionTooltip) {
    return (
      <ZoneDescriptionTooltip
        zone={zoneDescriptionTooltip.zone}
        x={zoneDescriptionTooltip.x}
        y={zoneDescriptionTooltip.y}
      />
    );
  }

  if (!tooltip) return null;
  if (!tooltip?.data?.length && !isInspectorMode) return null;

  return (
    <Popover.Root open={true}>
      <Popover.Content
        size="1"
        style={{
          position: 'fixed',
          left: tooltip.x + 14,
          top: tooltip.y + 14,
          pointerEvents: 'none',
        }}
      >
        <Box flexGrow="1">
          {tooltip.data.map((entry, i) => (
            <Text
              key={`tooltip-${i}`}
              as="div"
              size="1"
              // First line is the headline (e.g. the district being painted);
              // later lines are supporting detail.
              weight={i === 0 ? 'medium' : undefined}
              color={i === 0 ? undefined : 'gray'}
              style={{whiteSpace: 'nowrap'}}
            >
              {entry.label}:{' '}
              {!isNaN(+(entry.value as number))
                ? formatNumber(entry.value as number, NUMBER_FORMATS.STRING)
                : (entry.value as string)}
            </Text>
          ))}
          {isInspectorMode && <InspectorTooltip />}
        </Box>
      </Popover.Content>
    </Popover.Root>
  );
};
