'use client';
import {Box, Popover, Text} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/types';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {InspectorTooltip} from '@components/Map/Tooltip/InspectorTooltip';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneDescriptionTooltip} from './ZoneDescriptionTooltip';

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
        style={{
          position: 'fixed',
          left: tooltip.x + 10,
          top: tooltip.y + 10,
          pointerEvents: 'none',
        }}
      >
        <Box flexGrow="1">
          {tooltip.data.map((entry, i) => (
            <Text key={`tooltip-${i}`} style={{whiteSpace: 'nowrap'}}>
              {/* @ts-ignore */}
              {entry.label}:{' '}
              {!isNaN(+(entry.value as number))
                ? formatNumber(entry.value as number, 'string')
                : entry.value}
            </Text>
          ))}
          {isInspectorMode && <InspectorTooltip />}
        </Box>
      </Popover.Content>
    </Popover.Root>
  );
};
