'use client';
import {Box, Flex, Heading, IconButton, Link, Table, Text} from '@radix-ui/themes';
import {PersonIcon} from '@radix-ui/react-icons';
import {type CommentListing} from '@/app/utils/api/apiHandlers/getComments';
import {formatDistanceToNow} from 'date-fns';

interface CommentRenderersProps {
  comment: CommentListing;
  options: {
    showIdentifier?: boolean;
    showTitles?: boolean;
    showPlaces?: boolean;
    showStates?: boolean;
    showZipCodes?: boolean;
    showCreatedAt?: boolean;
  };
}

const getCommenterName = (comment: CommentListing) => {
  const parts = [comment.first_name, comment.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Anonymous';
};

export const CommentCard: React.FC<CommentRenderersProps> = ({comment, options}) => (
  <Box className="flex flex-col border border-zinc-200 rounded-lg p-4 shadow-sm bg-white h-full">
    <Flex align="center" gap="3" mb="2">
      {options.showIdentifier && (
        <Flex align="center" gap="2">
          <IconButton variant="ghost" size="3" aria-label="Commenter">
            <PersonIcon className="w-5 h-5 text-zinc-600" />
          </IconButton>
          <Text size="2" color="gray">{getCommenterName(comment)}</Text>
        </Flex>
      )}
      {options.showTitles && (
        <Heading size="4" className="text-districtrBlue text-wrap whitespace-pre-line max-w-[18rem] truncate">
          {comment.title}
        </Heading>
      )}
    </Flex>
    <Text className="mb-3 whitespace-pre-line">{comment.comment}</Text>
    <Flex wrap="wrap" gap="2">
      {comment.tags?.map(tag => (
        <Text 
          // TODO: Add tag list pages
          // href={`/api/comments/list?tag=${tag}`}
          key={tag}
          className="px-2 py-1 text-sm rounded-full bg-purple-100 text-black"
        >
          {tag}
        </Text>
      ))}
    </Flex>
    {options.showCreatedAt && (
      <Text className="mt-1 text-gray-400 text-xs text-right">
        {formatDistanceToNow(new Date(comment.created_at))} ago
      </Text>
    )}
  </Box>
);

export const CommentRow: React.FC<CommentRenderersProps> = ({comment, options}) => (
  <Table.Row>
    {options.showTitles && <Table.Cell>{comment.title}</Table.Cell>}
    {options.showIdentifier && <Table.Cell>{getCommenterName(comment)}</Table.Cell>}
    {options.showPlaces && <Table.Cell>{comment.place}</Table.Cell>}
    {options.showStates && <Table.Cell>{comment.state}</Table.Cell>}
    {options.showZipCodes && <Table.Cell>{comment.zip_code}</Table.Cell>}
    {options.showCreatedAt && (
      <Table.Cell>{formatDistanceToNow(new Date(comment.created_at))} ago</Table.Cell>
    )}
  </Table.Row>
);
