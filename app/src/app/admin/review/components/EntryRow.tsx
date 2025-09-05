import {ReviewStatus, ReviewItem} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {Box, Flex, Heading} from '@radix-ui/themes';
import {Text} from '@radix-ui/themes';
import {useState} from 'react';
import {ReviewBadge, ReviewButtons} from './ReviewBadge';

export const EntryRow: React.FC<{
  entry: ReviewItem;
  currentStatus?: ReviewStatus;
  onReview: (
    itemId: number,
    status: ReviewStatus,
    entryType: 'comment' | 'commenter' | 'tag'
  ) => Promise<void>;
  disabled?: boolean;
}> = ({entry, onReview}) => {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  return (
    <Flex
      direction="row"
      gap="2"
      align="start"
      justify="between"
      className="p-4 bg-white border-b-2 border-gray-200"
    >
      <Flex direction="column" gap="2" align="start" justify="between" className="flex-1 w-full">
        <Flex
          direction="row"
          gap="2"
          align="start"
          justify="between"
          className="flex-1 w-full pb-4 border-b-2 border-gray-200"
        >
          <Box>
            <Heading size="4">ID: {entry.comment_id}</Heading>
          </Box>
          <Flex direction="column" gap="2" align="start" justify="between" className="flex-0">
            <Heading size="4">Review Full Entry</Heading>
            <Flex direction="row" gap="2" align="start" justify="between" className="flex-1">
              <ReviewButtons
                status={entry.comment_review_status ?? null}
                onReview={status => {
                  onReview(entry.comment_id, status, 'comment');
                  onReview(entry.commenter_id as number, status, 'commenter');
                  Promise.all(entry.tag_ids.map(id => onReview(id as number, status, 'tag')));
                }}
              />
            </Flex>
          </Flex>
        </Flex>
        <Flex
          direction="row"
          gap="2"
          align="start"
          justify="between"
          className="flex-1 border-b-2 pb-2 border-gray-200 w-full"
          onMouseEnter={() => setHoveredSection('comment')}
          onMouseLeave={() => setHoveredSection(null)}
        >
          <Flex direction="column" gap="2" align="start" justify="between" className="flex-1">
            <Heading size="2">
              {entry.title}{' '}
              <ReviewBadge
                status={entry.comment_review_status}
                title="Review Comment"
                onReview={status => onReview(entry.comment_id, status, 'comment')}
              />
            </Heading>
            <Text size="2">{entry.comment}</Text>
          </Flex>
        </Flex>
        {entry.commenter_id && !isNaN(entry.commenter_id) ? (
          <Flex
            direction="row"
            gap="2"
            align="start"
            justify="between"
            className="flex-1 border-b-2 pb-2 border-gray-200 w-full"
          >
            <Flex
              direction="column"
              gap="2"
              align="start"
              justify="between"
              className="flex-1"
              onMouseEnter={() => setHoveredSection('commenter')}
              onMouseLeave={() => setHoveredSection(null)}
            >
              <Heading size="2">
                Commenter{' '}
                <ReviewBadge
                  status={entry.commenter_review_status}
                  title="Review Commenter"
                  onReview={status => onReview(entry.commenter_id as number, status, 'commenter')}
                />
              </Heading>
              <Text size="2">
                Name: {entry.first_name} {entry.last_name ?? 'No last name'}
              </Text>
              {/* <Text>{entry.email ?? 'No email'}</Text>
            <Text>{entry.salutation ?? 'No salutation'}</Text> */}
              <Text size="2">Place: {entry.place ?? 'No place'}</Text>
              <Text size="2">State: {entry.state ?? 'No state'}</Text>
              <Text size="2">Zip Code: {entry.zip_code ?? 'No zip code'}</Text>
            </Flex>
          </Flex>
        ) : (
          <Box className="w-full text-center border-b-2 border-gray-200 pb-2">No commenter</Box>
        )}

        {entry.tags.length > 0 ? (
          <>
            <Flex
              direction="row"
              gap="2"
              align="start"
              justify="between"
              className="flex-1 w-full"
              onMouseEnter={() => setHoveredSection('tags')}
              onMouseLeave={() => setHoveredSection(null)}
            >
              <Box>
                <Heading size="2">
                  Tags
                  <ReviewBadge
                    status={entry.comment_review_status as ReviewStatus}
                    title="Review ALL Tags"
                    onReview={status =>
                      Promise.all(entry.tag_ids.map(id => onReview(id as number, status, 'tag')))
                    }
                  />
                </Heading>
              </Box>
            </Flex>
            {entry.tags.map((tag,i) => (
              <Flex
                direction="row"
                gap="2"
                align="start"
                justify="between"
                key={i}
                className="flex-1 w-full"
                onMouseEnter={() => setHoveredSection(`tags-${tag}`)}
                onMouseLeave={() => setHoveredSection(null)}
              >
                <Text size="2" key={tag}>
                  {tag}

                  <ReviewBadge
                    onReview={status =>
                      onReview(entry.tag_ids[entry.tags.indexOf(tag)] as number, status, 'tag')
                    }
                    title={`Review Tag: ${tag}`}
                    status={entry.tag_review_status[entry.tags.indexOf(tag)] as ReviewStatus}
                  />
                </Text>
              </Flex>
            ))}
          </>
        ) : (
          <Box className="w-full text-center border-gray-200 pb-2">No tags</Box>
        )}
      </Flex>
    </Flex>
  );
};
