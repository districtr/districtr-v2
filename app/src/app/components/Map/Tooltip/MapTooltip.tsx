'use client';
import {Box, Popover, Text} from '@radix-ui/themes';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {InspectorTooltip} from '@components/Map/Tooltip/InspectorTooltip';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneCommentTooltip} from './ZoneCommentTooltip';

export const MapTooltip = () => {
  const tooltip = useTooltipStore(state => state.tooltip);
  const zoneCommentTooltip = useTooltipStore(state => state.zoneCommentTooltip);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const isInspectorMode = activeTool === 'inspector';

  // Render zone comment tooltip if active
  if (zoneCommentTooltip) {
    return (
      <ZoneCommentTooltip
        zone={zoneCommentTooltip.zone}
        x={zoneCommentTooltip.x}
        y={zoneCommentTooltip.y}
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
