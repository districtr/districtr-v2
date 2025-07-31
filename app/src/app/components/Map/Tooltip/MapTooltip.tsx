'use client';
import {Box, Popover, Text} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {InspectorTooltip} from '@components/Map/Tooltip/InspectorTooltip';

export const MapTooltip = () => {
  const tooltip = useTooltipStore(state => state.tooltip);
  const activeTool = useMapStore(state => state.activeTool);
  const isInspectorMode = activeTool === 'inspector';
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
