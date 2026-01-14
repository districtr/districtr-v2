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
  const [minModerationScore, setMinModerationScore] = useState<number>(0);

  const clearAllFilters = () => {
    setReviewStatus(null);
    setTags([]);
    setPlace(undefined);
    setState(undefined);
    setZipCode(undefined);
    setMinModerationScore(0);
  };

  const {data, status, refetch, isLoading} = useQuery({
    queryKey: [
      'review',
      reviewStatus,
      offset,
      limit,
      tags.join('|'),
      place,
      state,
      zipCode,
      minModerationScore,
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
          min_moderation_score: minModerationScore,
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
          <TagReviewFilter tags={tags} setTags={setTags} />
          <TextFilter title="Place" initialText={place} onEnter={setPlace} />
          <TextFilter title="State" initialText={state} onEnter={setState} />
          <TextFilter title="Zip Code" initialText={zipCode} onEnter={setZipCode} />
          <Button onClick={clearAllFilters} variant="outline" color="gray">
            Clear All Filters
          </Button>
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
