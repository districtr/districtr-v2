'use client';
import {Box, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {getCommunityDisplayNumber} from '@/app/utils/communities';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

interface ZoneCommentTooltipProps {
  zone: number;
  x: number;
  y: number;
}

export const ZoneCommentTooltip: React.FC<ZoneCommentTooltipProps> = ({zone, x, y}) => {
  const description = useMapStore(state => state.getZoneDescriptionForZone(zone));
  const communities = useMapStore(state => state.communities);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const getZoneColor = useZoneColorGetter();
  const color = getZoneColor(zone);
  const zoneLabel = mapMode === 'coi' ? 'Community' : 'District';
  const displayZone = mapMode === 'coi' ? getCommunityDisplayNumber(communities, zone) : zone;

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
      {description && (
        <Text size="1" color="blue" className="mt-1 italic">
          Click {zoneLabel.toLowerCase()} number for more information
        </Text>
      )}
    </Box>
  );
};

export default ZoneCommentTooltip;
