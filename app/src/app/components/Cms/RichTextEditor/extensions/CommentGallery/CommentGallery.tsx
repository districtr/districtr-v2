'use client';
import {QueryClientProvider, useQuery} from '@tanstack/react-query';
import {queryClient} from '@/app/utils/api/queryClient';
import {useEffect, useState} from 'react';
import {CommentFilters, getPublicComments} from '@/app/utils/api/apiHandlers/getComments';
import {CommentGalleryRenderer} from './CommentGalleryRenderer';
import {Button, Flex, Spinner, Text} from '@radix-ui/themes';

export interface CommentGalleryProps {
  _ids?: number[];
  _tags?: string[];
  _place?: string;
  _state?: string;
  _zipCode?: string;
  _offset?: number;
  _limit?: number;
}

export const CommentGalleryInner: React.FC<CommentGalleryProps> = ({
  _ids,
  _tags,
  _place,
  _state,
  _zipCode,
  _offset,
  _limit,
}) => {
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<CommentFilters>({
    ids: _ids,
    tags: _tags,
    place: _place,
    state: _state,
    zipCode: _zipCode,
    offset: _offset,
    limit: _limit,
  });

  useEffect(() => {
    setFilters({
      ids: _ids,
      tags: _tags,
      place: _place,
      state: _state,
      zipCode: _zipCode,
      offset: _offset,
      limit: _limit,
    });
  }, [_ids, _tags, _place, _state, _zipCode, _offset, _limit]);

  const {data: comments, isLoading} = useQuery({
    queryKey: ['comments', JSON.stringify(filters), offset, limit],
    queryFn: () => getPublicComments({...filters, offset, limit}),
  });

  if (isLoading) {
    return (
      <Flex direction="column" align="center" justify="center" className="w-full">
        <Spinner size="3" />
        <Text>Loading comments...</Text>
      </Flex>
    );
  }
  if (comments && !comments.ok) {
    return (
      <Flex direction="column" align="center" justify="center" className="w-full">
        <Text>Error loading comments</Text>
        <Text>{comments.error.detail}</Text>
      </Flex>
    );
  } else if (comments && comments.ok) {
    return (
      <Flex direction="column">
        <CommentGalleryRenderer comments={comments.response ?? []} />;
        {comments.response.length && (
          <Flex justify="start" mt="4" gap="4">
            <Button onClick={() => setOffset(offset - 1)} disabled={offset === 0}>
              Previous
            </Button>
            <Button
              onClick={() => setOffset(offset + 1)}
              disabled={comments.response.length < limit}
            >
              Next
            </Button>
          </Flex>
        )}
      </Flex>
    );
  } else {
    return (
      <Flex direction="column" align="center" justify="center" className="w-full">
        <Text>Error loading comments</Text>
      </Flex>
    );
  }
};

export const CommentGallery = (props: CommentGalleryProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <CommentGalleryInner {...props} />
    </QueryClientProvider>
  );
};
