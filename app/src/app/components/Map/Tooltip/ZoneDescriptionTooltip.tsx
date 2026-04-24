'use client';
import {Box, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {getCommunityDisplayNumber} from '@/app/utils/communities';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {MAP_MODES, MAP_MODE_LABELS} from '@constants/map/mode';

interface ZoneDescriptionTooltipProps {
  zone: number;
  x: number;
  y: number;
}

export const ZoneDescriptionTooltip: React.FC<ZoneDescriptionTooltipProps> = ({zone, x, y}) => {
  const description = useMapStore(state => state.getZoneDescriptionForZone(zone));
  const communities = useMapStore(state => state.communities);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const getZoneColor = useZoneColorGetter();
  const color = getZoneColor(zone);
  const zoneLabel = MAP_MODE_LABELS[mapMode];
  const displayZone =
    mapMode === MAP_MODES.COI ? getCommunityDisplayNumber(communities, zone) : zone;

  return (
    <Box
      className="fixed bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50 max-w-xs pointer-events-none"
      style={{
        left: x + 15,
        top: y + 15,
      }}
    >
      <Flex align="center" gap="2" className="mb-2">
        <Box
          className="w-3 h-3 rounded-full border border-gray-400"
          style={{backgroundColor: color}}
        />
        <Text size="2" weight="bold">
          {zoneLabel} {displayZone} Description
        </Text>
      </Flex>
      <Text size="1" color="gray">
        {description ? description.text : 'No description'}
      </Text>
    </Box>
  );
};

export default ZoneDescriptionTooltip;
