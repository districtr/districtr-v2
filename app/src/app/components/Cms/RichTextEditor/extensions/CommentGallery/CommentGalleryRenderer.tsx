import {Box, Flex, Grid, Heading, IconButton, Link, Text} from '@radix-ui/themes';
import {PersonIcon} from '@radix-ui/react-icons';
import {type CommentListing} from '@/app/utils/api/apiHandlers/getComments';
import {formatDistanceToNow} from 'date-fns';

export const CommentGalleryRenderer: React.FC<{
  comments: CommentListing[];
}> = ({comments}) => (
  <Flex direction="column" width="100%" gap="2">
    {comments.map((c, idx) => (
      <Box
        key={idx}
        className="flex flex-col border border-zinc-200 rounded-lg p-4 shadow-sm bg-white"
      >
        <Flex align="center" gap="3" mb="2">
          <IconButton variant="ghost" size="3" aria-label="Commenter">
            <PersonIcon className="w-5 h-5 text-zinc-600" />
          </IconButton>
          <Heading size="4" className="text-districtrBlue">
            {c.title}
          </Heading>
        </Flex>
        <Text className="mb-3 whitespace-pre-line">{c.comment}</Text>
        <Flex wrap="wrap" gap="2">
          {c.tags?.map(tag => (
            <Link
              href={`/api/comments/list?tag=${tag}`}
              key={tag}
              className="px-2 py-1 text-sm rounded-full bg-purple-100 text-black"
            >
              {tag}
            </Link>
          ))}
        </Flex>
        <Text className="mt-1 text-gray-400 text-xs text-right">
          {formatDistanceToNow(c.created_at)} ago
        </Text>
      </Box>
    ))}
  </Flex>
);
