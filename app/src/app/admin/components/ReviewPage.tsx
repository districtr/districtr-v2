'use client';
import {useState, useEffect} from 'react';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {
  getCommentsForReview,
  reviewComment,
  Comment,
  ReviewStatus,
  ReviewListParams,
  getCommentersForReview,
  getTagsForReview,
  Tag,
  Commenter,
  reviewTag,
  reviewCommenter,
} from '@/app/utils/api/apiHandlers/reviewHandlers';
import ReviewStatusFilter from '../review/components/ReviewStatusFilter';
import Pagination from '../review/components/Pagination';
import {EntryRow} from '../review/components/EntryRow';
import {Button, Flex, Heading, Spinner, Text} from '@radix-ui/themes';

const ITEMS_PER_PAGE = 20;

const GET_ITEMS_FUNCTIONS = {
  comments: getCommentsForReview,
  tags: getTagsForReview,
  commenters: getCommentersForReview,
};

const REVIEW_ITEMS_FUNCTIONS = {
  comments: reviewComment,
  tags: reviewTag,
  commenters: reviewCommenter,
};

type ItemType = keyof typeof GET_ITEMS_FUNCTIONS;

export const ReviewPage: React.FC<{type: ItemType}> = ({type}: {type: ItemType}) => {
  const session = useCmsFormStore(state => state.session);
  const [items, setItems] = useState<Comment[] | Tag[] | Commenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [totalItems, setTotalItems] = useState(0);

  const loadItems = async () => {
    setLoading(true);
    setError(null);

    const params: ReviewListParams = {
      offset: currentOffset,
      limit: ITEMS_PER_PAGE,
    };

    if (reviewStatusFilter !== 'all') {
      params.review_status = reviewStatusFilter;
    }

    const result = await GET_ITEMS_FUNCTIONS[type](params, session);

    if (result.ok) {
      setItems(result.data);
      // Note: The API doesn't return total count, so we estimate based on results
      // In a real implementation, the API should return pagination metadata
      setTotalItems(
        result.data.length === ITEMS_PER_PAGE
          ? currentOffset + ITEMS_PER_PAGE + 1
          : currentOffset + result.data.length
      );
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, [currentOffset, reviewStatusFilter]);

  const getHandleReview = (itemId: number) => async (status: ReviewStatus) => {
    const result = await REVIEW_ITEMS_FUNCTIONS[type](itemId, status, session);

    if (result.ok) {
      // Update the comment in the local state
      setItems(prev =>
        prev.map(
          (item: Comment | Tag | Commenter) =>
            (item.id === itemId ? {...item, review_status: status} : item) as any
        )
      );
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const handleStatusFilterChange = (status: ReviewStatus | 'all') => {
    setReviewStatusFilter(status);
    setCurrentOffset(0);
  };

  const handlePageChange = (offset: number) => {
    setCurrentOffset(offset);
  };

  if (loading) {
    return (
      <Flex direction="column" gap="2" align="center" justify="center" className="h-64">
        <Spinner />
        <Text>Loading...</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2">
      <Flex direction="column" gap="2">
        <Heading>Review {type.charAt(0).toUpperCase() + type.slice(1)}</Heading>
        <Text>Review and moderate user comments for appropriate content.</Text>
      </Flex>

      <ReviewStatusFilter
        currentStatus={reviewStatusFilter}
        onStatusChange={handleStatusFilterChange}
      />

      {error && (
        <Flex direction="column" gap="2" align="center" justify="center" className="h-64">
          <Text color="red">Error loading comments: {error}</Text>
          <Button onClick={loadItems}>Try again</Button>
        </Flex>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {items.length === 0 ? (
            <li className="px-6 py-4 text-center text-gray-500">
              No items found with the current filters.
            </li>
          ) : (
            items.map(comment => (
              <EntryRow entry={comment} onReview={getHandleReview(comment.id)} />
            ))
          )}
        </ul>
      </div>

      {items.length > 0 && (
        <Pagination
          currentOffset={currentOffset}
          limit={ITEMS_PER_PAGE}
          total={totalItems}
          onPageChange={handlePageChange}
        />
      )}
    </Flex>
  );
};
