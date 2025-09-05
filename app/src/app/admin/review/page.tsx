'use client';
import {Blockquote, Box, Flex, Grid, Heading, RadioGroup, Spinner, Text} from '@radix-ui/themes';
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

  const {data, status, refetch, isLoading} = useQuery({
    queryKey: ['review', reviewStatus, offset, limit],
    queryFn: () => getAdminCommentsList({review_status: reviewStatus, offset, limit}, session),
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
          className="w-64 bg-white shadow-md border-[1px] border-gray-200 p-4 rounded-md"
        >
          <Heading size="4" as="h3" mb="2">
            Filter Comments
          </Heading>
          <Flex direction="column" gap="2" justify="between" className="w-full">
            <Heading size="2" as="h3">
              Review Status
            </Heading>
            <RadioGroup.Root
              onValueChange={value => setReviewStatus(value as ReviewStatus)}
              value={reviewStatus as string}
              defaultValue={REVIEW_STATUS_OPTIONS[0].value as string}
            >
              {REVIEW_STATUS_OPTIONS.map(item => {
                return (
                  <RadioGroup.Item value={item.value as string} key={item.name}>
                    {item.name}
                  </RadioGroup.Item>
                );
              })}
            </RadioGroup.Root>
          </Flex>
        </Flex>
        <Flex direction="column" gap="4" className="w-full flex-1">
          <Box>
            <Heading>Comment Review Dashboard</Heading>
            <Text>Review and moderate comments, tags, and commenters</Text>
          </Box>
          {isLoading && <Spinner />}
          {data?.ok && data?.data.length > 0 && (
            <>
              {data?.data.map(item => (
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
          {data?.ok && data?.data.length === 0 && <Blockquote color="green">No comments to review 🎉</Blockquote>}
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
