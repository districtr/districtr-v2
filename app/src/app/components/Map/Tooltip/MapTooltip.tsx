'use client';
import {Box, Popover, Text} from '@radix-ui/themes';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {InspectorTooltip} from '@components/Map/Tooltip/InspectorTooltip';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneDescriptionTooltip} from './ZoneDescriptionTooltip';
import {NUMBER_FORMATS} from '@constants/demography/format';

const CURSOR_OFFSET = 10;

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

  // Manually positioned (no Radix anchor, so no built-in collision handling).
  // With the cursor in the lower half of the viewport the popover hangs up
  // from the cursor instead of down, so the inspector table never runs off
  // the bottom edge. Horizontal clipping isn't reachable: the sidebar keeps
  // the popover's width inside the map area.
  const flipUp = tooltip.y > window.innerHeight / 2;

  return (
    <Popover.Root open={true}>
      <Popover.Content
        style={{
          position: 'fixed',
          left: tooltip.x + CURSOR_OFFSET,
          // translateY(-100%) hangs the box up from the cursor without
          // measuring it; a `bottom` anchor would resolve against Radix's
          // portal wrapper rather than the viewport.
          ...(flipUp
            ? {top: tooltip.y - CURSOR_OFFSET, transform: 'translateY(-100%)'}
            : {top: tooltip.y + CURSOR_OFFSET}),
          pointerEvents: 'none',
        }}
      >
        <Box flexGrow="1">
          {tooltip.data.map((entry, i) => (
            <Text key={`tooltip-${i}`} style={{whiteSpace: 'nowrap'}}>
              {/* @ts-ignore */}
              {entry.label}:{' '}
              {!isNaN(+(entry.value as number))
                ? formatNumber(entry.value as number, NUMBER_FORMATS.STRING)
                : entry.value}
            </Text>
          ))}
          {isInspectorMode && <InspectorTooltip />}
        </Box>
      </Popover.Content>
    </Popover.Root>
  );
};
