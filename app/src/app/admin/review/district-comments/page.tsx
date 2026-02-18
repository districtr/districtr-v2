'use client';
import {
  Blockquote,
  Box,
  Button,
  Flex,
  Heading,
  RadioGroup,
  Spinner,
  Text,
} from '@radix-ui/themes';
import {useState} from 'react';
import {
  REVIEW_STATUS_ENUM,
  ReviewStatus,
  getAdminDistrictCommentsList,
  reviewItem,
} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {useQuery} from '@tanstack/react-query';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import Pagination from '@/app/admin/review/components/Pagination';
import {EntryRow} from '@/app/admin/review/components/EntryRow';
import {TextFilter} from '@/app/admin/review/components/TextFilter';
import Link from 'next/link';

const ITEMS_PER_PAGE = 20;
const REVIEW_STATUS_OPTIONS = [
  {name: 'Not yet reviewed', value: null},
  {name: 'Approved', value: REVIEW_STATUS_ENUM.APPROVED},
  {name: 'Rejected', value: REVIEW_STATUS_ENUM.REJECTED},
  {name: 'Reviewed', value: REVIEW_STATUS_ENUM.REVIEWED},
];

export default function DistrictCommentsReviewPage() {
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(null);
  const session = useCmsFormStore(state => state.session);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(ITEMS_PER_PAGE);
  const [documentId, setDocumentId] = useState<string>('');
  const [documentIdFilter, setDocumentIdFilter] = useState<string | undefined>(undefined);
  const [commentId, setCommentId] = useState<string>('');
  const [commentIdFilter, setCommentIdFilter] = useState<number | undefined>(undefined);
  const [maxModerationScore, setMaxModerationScore] = useState<number>(1.0);

  const applyDocumentFilter = () => {
    setDocumentIdFilter(documentId.trim() || undefined);
    setOffset(0);
  };

  const applyCommentIdFilter = () => {
    const parsed = commentId.trim() ? parseInt(commentId.trim(), 10) : undefined;
    setCommentIdFilter(Number.isNaN(parsed) ? undefined : parsed);
    setOffset(0);
  };

  const clearAllFilters = () => {
    setReviewStatus(null);
    setDocumentId('');
    setDocumentIdFilter(undefined);
    setCommentId('');
    setCommentIdFilter(undefined);
    setMaxModerationScore(1.0);
    setOffset(0);
  };

  const {data, status, refetch, isLoading} = useQuery({
    queryKey: [
      'district-comments-review',
      reviewStatus,
      offset,
      limit,
      documentIdFilter,
      commentIdFilter,
      maxModerationScore,
    ],
    queryFn: () =>
      getAdminDistrictCommentsList(
        {
          review_status: reviewStatus,
          offset,
          limit,
          document_id: documentIdFilter,
          comment_id: commentIdFilter,
          max_moderation_score: maxModerationScore,
        },
        session
      ),
    staleTime: 1000,
  });

  const handleReview = async (
    itemId: number,
    status: ReviewStatus,
    entryType: 'comment' | 'commenter' | 'tag'
  ) => {
    await reviewItem(itemId, status, entryType, session).then(() => refetch());
  };

  return (
    <Flex direction="row">
      <Flex
        direction={{initial: 'column', md: 'row'}}
        gap="4"
        align="start"
        justify="between"
        className="h-full w-full"
      >
        <Flex
          direction="column"
          gap="4"
          className="w-64 bg-white shadow-md border-[1px] border-gray-200 p-4 rounded-md"
        >
          <Heading size="4" as="h3" mb="2">
            District Comments Filter
          </Heading>
          <Flex direction="column" gap="2" className="w-full">
            <Text size="2">Document ID (UUID) - look up comments by map</Text>
            <Flex gap="2">
              <input
                type="text"
                placeholder="Enter document UUID..."
                value={documentId}
                onChange={e => setDocumentId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyDocumentFilter()}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <Button size="1" onClick={applyDocumentFilter}>
                Search
              </Button>
            </Flex>
          </Flex>
          <Flex direction="column" gap="2" className="w-full">
            <Text size="2">Comment ID</Text>
            <Flex gap="2">
              <input
                type="number"
                placeholder="Look up by ID..."
                value={commentId}
                onChange={e => setCommentId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCommentIdFilter()}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <Button size="1" onClick={applyCommentIdFilter}>
                Search
              </Button>
            </Flex>
          </Flex>
          <Flex direction="column" gap="2" justify="between" className="w-full">
            <Text size="2">Comment Review Status</Text>
            <RadioGroup.Root
              onValueChange={value => setReviewStatus(value as ReviewStatus)}
              value={reviewStatus as string}
              defaultValue={REVIEW_STATUS_OPTIONS[0].value as string}
            >
              {REVIEW_STATUS_OPTIONS.map(item => (
                <RadioGroup.Item
                  value={item.value?.toString() ?? ''}
                  key={item.name}
                >
                  {item.name}
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </Flex>
          <Button onClick={clearAllFilters} variant="outline" color="gray">
            Clear All Filters
          </Button>
          <Link href="/admin/review" className="text-sm text-blue-600 hover:underline">
            ← Back to Form Comments
          </Link>
        </Flex>
        <Flex direction="column" gap="4" className="w-full flex-1">
          <Box>
            <Heading>District Comment Moderation</Heading>
            <Text>
              Moderate zone-level comments on maps. Use Document ID to look up
              comments for a specific map.
            </Text>
          </Box>
          {isLoading && <Spinner />}
          {data && !data.ok && (
            <Blockquote color="red">
              Error loading district comments: {data.error?.detail || 'Unknown error'}
            </Blockquote>
          )}
          {data?.ok && data?.response.length > 0 && (
            <>
              {data.response.map(item => (
                <EntryRow
                  entry={item}
                  onReview={handleReview}
                  key={`${item.comment_id}-${item.zone ?? ''}`}
                />
              ))}
              <Pagination
                currentOffset={offset}
                limit={limit}
                total={offset * limit + limit}
                onPageChange={setOffset}
              />
            </>
          )}
          {data?.ok && data?.response.length === 0 && (
            <Blockquote color="green">
              No district comments to review{documentIdFilter ? ' for this document' : ''} 🎉
            </Blockquote>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
