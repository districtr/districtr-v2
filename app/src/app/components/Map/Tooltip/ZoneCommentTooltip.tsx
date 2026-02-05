'use client';
import {Box, Flex, Text, Separator} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useColorScheme} from '@/app/hooks/useColorScheme';

interface ZoneCommentTooltipProps {
  zone: number;
  x: number;
  y: number;
}

export const ZoneCommentTooltip: React.FC<ZoneCommentTooltipProps> = ({zone, x, y}) => {
  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const colorScheme = useColorScheme();
  const color = colorScheme[(zone - 1) % colorScheme.length];

  if (!comments.length) return null;

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
          District {zone} Comments
        </Text>
      </Flex>
      <Flex direction="column" gap="2">
        {comments.slice(0, 3).map((comment, index) => (
          <Box key={index}>
            {index > 0 && <Separator size="4" className="my-1" />}
            <Text size="1" weight="medium" className="block">
              {comment.title}
            </Text>
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
              {comment.comment}
            </Text>
          </Box>
        ))}
        {comments.length > 3 && (
          <Text size="1" color="blue">
            +{comments.length - 3} more comment{comments.length - 3 > 1 ? 's' : ''}
          </Text>
        )}
      </Flex>
      <Text size="1" color="gray" className="mt-2 block italic">
        Click to pin in sidebar
      </Text>
    </Box>
  );
};

export default ZoneCommentTooltip;
