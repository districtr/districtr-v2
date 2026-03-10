'use client';
import {Box, Flex, Text, Separator} from '@radix-ui/themes';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {getCoiCommunityDisplayNumber} from '@/app/utils/coiCommunities';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

interface ZoneCommentTooltipProps {
  zone: number;
  x: number;
  y: number;
}

export const ZoneCommentTooltip: React.FC<ZoneCommentTooltipProps> = ({zone, x, y}) => {
  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const coiCommunities = useMapStore(state => state.coiCommunities);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const getZoneColor = useZoneColorGetter();
  const color = getZoneColor(zone);
  const zoneLabel = mapMode === 'coi' ? 'Community' : 'District';
  const displayZone = mapMode === 'coi' ? getCoiCommunityDisplayNumber(coiCommunities, zone) : zone;

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
          {zoneLabel} {displayZone} Comments
        </Text>
      </Flex>
      <Flex direction="column" gap="2">
        {!!comments.length ? (
          comments.slice(0, 3).map((comment, index) => (
            <Box key={index}>
              {index > 0 && <Separator size="4" className="my-1" />}
              <Text
                size="1"
                color="gray"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {comment.text}
              </Text>
            </Box>
          ))
        ) : (
          <Text size="1" color="gray">
            No comments
          </Text>
        )}
        {comments.length > 3 && (
          <Text size="1" color="blue">
            +{comments.length - 3} more comment{comments.length - 3 > 1 ? 's' : ''}
          </Text>
        )}
        {comments.length > 0 && (
          <Text size="1" color="blue" className="mt-1 italic">
            Click {zoneLabel.toLowerCase()} number for more information
          </Text>
        )}
      </Flex>
    </Box>
  );
};

export default ZoneCommentTooltip;
