'use client';
import {
  Blockquote,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  RadioGroup,
  Spinner,
  Text,
} from '@radix-ui/themes';
import {useState} from 'react';
import {
  REVIEW_STATUS_ENUM,
  ReviewStatus,
  getAdminCommentsList,
  reviewItem,
} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {useQuery} from '@tanstack/react-query';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import Pagination from '@/app/admin/review/components/Pagination';
import {EntryRow} from '@/app/admin/review/components/EntryRow';
import {TagReviewFilter} from '@/app/admin/review/components/TagReviewFilter';
import {TextFilter} from '@/app/admin/review/components/TextFilter';

const ITEMS_PER_PAGE = 20;
const REVIEW_STATUS_OPTIONS = [
  {
    name: 'Not yet reviewed',
    value: null,
  },
  {
    name: 'Approved',
    value: REVIEW_STATUS_ENUM.APPROVED,
  },
  {
    name: 'Rejected',
    value: REVIEW_STATUS_ENUM.REJECTED,
  },
  {
    name: 'Dismissed',
    value: REVIEW_STATUS_ENUM.REVIEWED,
  },
];

export default function ReviewHome() {
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(null);
  const session = useCmsFormStore(state => state.session);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(ITEMS_PER_PAGE);
  const [tags, setTags] = useState<string[]>([]);
  const [place, setPlace] = useState<string | undefined>(undefined);
  const [state, setState] = useState<string | undefined>(undefined);
  const [zipCode, setZipCode] = useState<string | undefined>(undefined);
  const [commentId, setCommentId] = useState<string>('');
  const [commentIdFilter, setCommentIdFilter] = useState<number | undefined>(undefined);
  const [reviewFlagged, setReviewFlagged] = useState<boolean>(false);
  const [maxModerationScore, setMaxModerationScore] = useState<number>(1.0);

  const applyCommentIdFilter = () => {
    const parsed = commentId.trim() ? parseInt(commentId.trim(), 10) : undefined;
    setCommentIdFilter(Number.isNaN(parsed) ? undefined : parsed);
    setOffset(0);
  };

  const clearAllFilters = () => {
    setReviewStatus(null);
    setTags([]);
    setPlace(undefined);
    setState(undefined);
    setZipCode(undefined);
    setCommentId('');
    setCommentIdFilter(undefined);
    setReviewFlagged(true);
    setMaxModerationScore(1.0);
  };

  const {data, status, refetch, isLoading} = useQuery({
    queryKey: [
      'review',
      reviewStatus,
      reviewFlagged,
      offset,
      limit,
      tags.join('|'),
      place,
      state,
      zipCode,
      commentIdFilter,
      maxModerationScore,
    ],
    queryFn: () =>
      getAdminCommentsList(
        {
          review_status: reviewStatus,
          review_flagged: reviewFlagged || undefined,
          offset,
          limit,
          tags,
          place,
          state,
          zip_code: zipCode,
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
        direction={{
          initial: 'column',
          md: 'row',
        }}
        gap="4"
        align="start"
        justify="between"
        className="h-full w-full"
      >
        {/* Sidebar */}
        <Flex
          direction="column"
          gap="4"
          className="w-64 bg-white shadow-md border-[1px] border-gray-200 p-4 rounded-md"
        >
          <Heading size="4" as="h3" mb="2">
            Filter Comments
          </Heading>
          <Flex direction="column" gap="2" justify="between" className="w-full">
            <Text size="2">
              Comment Review Status (may be different from tag and commenter review status)
            </Text>
            <RadioGroup.Root
              onValueChange={value => setReviewStatus(value as ReviewStatus)}
              value={reviewStatus as string}
              defaultValue={REVIEW_STATUS_OPTIONS[0].value as string}
            >
              {REVIEW_STATUS_OPTIONS.map(item => {
                return (
                  <RadioGroup.Item value={item.value?.toString() ?? ''} key={item.name}>
                    {item.name}
                  </RadioGroup.Item>
                );
              })}
            </RadioGroup.Root>
          </Flex>
          <Flex direction="column" gap="2" className="w-full">
            <Text size="2">Flagged for review</Text>
            <Flex align="center" gap="2">
              <input
                type="checkbox"
                id="review-flagged"
                checked={reviewFlagged}
                onChange={e => {
                  setReviewFlagged(e.target.checked);
                  setOffset(0);
                }}
                className="rounded border-gray-300"
              />
              <Text as="label" htmlFor="review-flagged">
                Show only flagged comments
              </Text>
            </Flex>
          </Flex>
          <TagReviewFilter tags={tags} setTags={setTags} />
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
          <TextFilter title="Place" initialText={place} onEnter={setPlace} />
          <TextFilter title="State" initialText={state} onEnter={setState} />
          <TextFilter title="Zip Code" initialText={zipCode} onEnter={setZipCode} />
          <Button onClick={clearAllFilters} variant="outline" color="gray">
            Clear All Filters
          </Button>
          <a
            href="/admin/review/district-comments"
            className="text-sm text-blue-600 hover:underline mt-2"
          >
            District Comments Moderation →
          </a>
        </Flex>
        <Flex direction="column" gap="4" className="w-full flex-1">
          <Box>
            <Heading>Comment Review Dashboard</Heading>
            <Text>Review and moderate comments, tags, and commenters</Text>
          </Box>
          {isLoading && <Spinner />}
          {data && !data.ok && (
            <Blockquote color="red">
              Error loading comments: {data.error?.detail || 'Unknown error'}
            </Blockquote>
          )}
          {data?.ok && data?.response.length > 0 && (
            <>
              {data?.response.map(item => (
                <EntryRow entry={item} onReview={handleReview} key={item.comment_id} />
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
            <Blockquote color="green">No comments to review 🎉</Blockquote>
          )}
          <Grid
            columns={{
              initial: '1',
              md: '2',
              lg: '3',
            }}
            gap="4"
          ></Grid>
        </Flex>
      </Flex>
    </Flex>
  );
}
