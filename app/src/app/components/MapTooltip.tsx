import {Box, Flex, Popover, Text} from '@radix-ui/themes';
import {useMapStore} from '../store/mapStore';
import {formatNumber} from '../utils/numbers';
import {useTooltipStore} from '../store/tooltipStore';

export const MapTooltip = () => {
  const tooltip = useTooltipStore(state => state.tooltip);
  const showPopulationTooltip = useMapStore(state => state.mapOptions.showPopulationTooltip);
  if (!showPopulationTooltip || !tooltip) return null;

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
        </Box>
      </Popover.Content>
    </Popover.Root>
  );
};
