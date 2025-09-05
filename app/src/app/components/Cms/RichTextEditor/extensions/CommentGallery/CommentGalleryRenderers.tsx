'use client';
import {Box, Flex, Heading, IconButton, Link, Table, Text} from '@radix-ui/themes';
import {PersonIcon} from '@radix-ui/react-icons';
import {type CommentListing} from '@/app/utils/api/apiHandlers/getComments';
import {formatDistanceToNow} from 'date-fns';

export const CommentCard: React.FC<{comment: CommentListing}> = ({comment}) => (
  <Box className="flex flex-col border border-zinc-200 rounded-lg p-4 shadow-sm bg-white">
    <Flex align="center" gap="3" mb="2">
      <IconButton variant="ghost" size="3" aria-label="Commenter">
        <PersonIcon className="w-5 h-5 text-zinc-600" />
      </IconButton>
      <Heading size="4" className="text-districtrBlue">
        {comment.title}
      </Heading>
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
      {formatDistanceToNow(comment.created_at)} ago
    </Text>
  </Box>
);

export const CommentRow: React.FC<{comment: CommentListing}> = ({comment}) => (
  <Table.Row>
    <Table.Cell>{comment.title}</Table.Cell>
    <Table.Cell>{comment.place}</Table.Cell>
    <Table.Cell>{comment.state}</Table.Cell>
    <Table.Cell>{comment.zip_code}</Table.Cell>
    <Table.Cell>{formatDistanceToNow(comment.created_at)} ago</Table.Cell>
  </Table.Row>
);


