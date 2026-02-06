'use client';
import {
  Badge,
  Blockquote,
  Box,
  Button,
  Flex,
  Heading,
  RadioGroup,
  Spinner,
  Text,
} from '@radix-ui/themes';
import {useMemo, useState} from 'react';
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
    name: 'Reviewed',
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
  const [maxModerationScore, setMaxModerationScore] = useState<number>(1.0);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (reviewStatus) count++;
    if (tags.length > 0) count++;
    if (place) count++;
    if (state) count++;
    if (zipCode) count++;
    if (maxModerationScore < 1.0) count++;
    return count;
  }, [reviewStatus, tags, place, state, zipCode, maxModerationScore]);

  const clearAllFilters = () => {
    setReviewStatus(null);
    setTags([]);
    setPlace(undefined);
    setState(undefined);
    setZipCode(undefined);
    setMaxModerationScore(1.0);
  };

  const {data, refetch, isLoading} = useQuery({
    queryKey: [
      'review',
      reviewStatus,
      offset,
      limit,
      tags.join('|'),
      place,
      state,
      zipCode,
      maxModerationScore,
    ],
    queryFn: () =>
      getAdminCommentsList(
        {
          review_status: reviewStatus,
          offset,
          limit,
          tags,
          place,
          state,
          zip_code: zipCode,
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
    <Flex
      direction={{
        initial: 'column',
        md: 'row',
      }}
      gap="4"
      align="start"
      className="w-full"
    >
      {/* Sidebar */}
      <Flex
        direction="column"
        gap="4"
        className="w-full md:w-72 shrink-0 bg-white shadow-sm border border-gray-200 p-4 rounded-lg"
      >
        <Flex direction="row" align="center" justify="between">
          <Flex align="center" gap="2">
            <Heading size="4" as="h3">
              Filters
            </Heading>
            {activeFilterCount > 0 && (
              <Badge color="blue" variant="solid" size="1">
                {activeFilterCount}
              </Badge>
            )}
          </Flex>
          {activeFilterCount > 0 && (
            <Button onClick={clearAllFilters} variant="ghost" color="gray" size="1">
              Clear all
            </Button>
          )}
        </Flex>

        <Flex direction="column" gap="2" className="w-full">
          <Text size="2" weight="medium">
            Review Status
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
        <TagReviewFilter tags={tags} setTags={setTags} />
        <TextFilter title="Place" initialText={place} onEnter={setPlace} />
        <TextFilter title="State" initialText={state} onEnter={setState} />
        <TextFilter title="Zip Code" initialText={zipCode} onEnter={setZipCode} />
      </Flex>

      {/* Main content */}
      <Flex direction="column" gap="4" className="w-full flex-1 min-w-0">
        <Box>
          <Heading size="6">Comment Review</Heading>
          <Text size="2" className="text-gray-500">
            Review and moderate comments, tags, and commenters
          </Text>
        </Box>
        {isLoading && (
          <Flex align="center" justify="center" py="8">
            <Spinner />
          </Flex>
        )}
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
          <Flex
            align="center"
            justify="center"
            py="8"
            className="bg-white rounded-lg border border-gray-200"
          >
            <Text size="3" className="text-gray-500">
              No comments to review
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}
