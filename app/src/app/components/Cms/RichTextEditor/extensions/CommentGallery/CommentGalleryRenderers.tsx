'use client';
import {Box, Flex, Heading, IconButton, Link, Table, Text} from '@radix-ui/themes';
import {PersonIcon} from '@radix-ui/react-icons';
import {type CommentListing} from '@/app/utils/api/apiHandlers/getComments';
import {formatDistanceToNow} from 'date-fns';

interface CommentRenderersProps {
  comment: CommentListing;
  options: {
    showIdentitifier?: boolean;
    showTitles?: boolean;
    showPlaces?: boolean;
    showStates?: boolean;
    showZipCodes?: boolean;
    showCreatedAt?: boolean;
  };
}
export const CommentCard: React.FC<CommentRenderersProps> = ({comment, options}) => (
  <Box className="flex flex-col border border-zinc-200 rounded-lg p-4 shadow-sm bg-white">
    <Flex align="center" gap="3" mb="2">
      {options.showIdentitifier && <IconButton variant="ghost" size="3" aria-label="Commenter">
        <PersonIcon className="w-5 h-5 text-zinc-600" />
      </IconButton>}
      {options.showTitles && <Heading size="4" className="text-districtrBlue">
        {comment.title}
      </Heading>}
    </Flex>
    <Text className="mb-3 whitespace-pre-line">{comment.comment}</Text>
    <Flex wrap="wrap" gap="2">
      {comment.tags?.map(tag => (
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
      {options.showCreatedAt && formatDistanceToNow(comment.created_at)} ago
    </Text>
  </Box>
);

export const CommentRow: React.FC<CommentRenderersProps> = ({comment, options}) => (
  <Table.Row>
    {options.showIdentitifier && <Table.Cell>{comment.title}</Table.Cell>}
    {options.showTitles && <Table.Cell>{comment.title}</Table.Cell>}
    {options.showPlaces && <Table.Cell>{comment.place}</Table.Cell>}
    {options.showStates && <Table.Cell>{comment.state}</Table.Cell>}
    {options.showZipCodes && <Table.Cell>{comment.zip_code}</Table.Cell>}
    {options.showCreatedAt && <Table.Cell>{formatDistanceToNow(comment.created_at)} ago</Table.Cell>}
  </Table.Row>
);


