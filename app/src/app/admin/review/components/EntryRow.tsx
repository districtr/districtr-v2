import {Comment, ReviewStatus} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {Tag} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {Commenter} from '@/app/utils/api/apiHandlers/reviewHandlers';
import ReviewActionButtons from './ReviewActionButtons';
import {Flex, Heading} from '@radix-ui/themes';
import {Text} from '@radix-ui/themes';

export const EntryRow: React.FC<{
  entry: Comment | Tag | Commenter;
  currentStatus?: ReviewStatus;
  onReview: (status: ReviewStatus) => Promise<void>;
  disabled?: boolean;
}> = ({entry, onReview}) => {
  return (
    <Flex direction="row" gap="2" align="start" justify="between" className="p-4 bg-white border-b-2 border-gray-200">
      <Flex direction="column" gap="2" align="start" justify="between" className="flex-1">
        <Heading>
          {(entry as Comment).title ? (entry as Commenter).first_name : (entry as Tag).slug}
        </Heading>
        {!('slug' in entry) && (
          <Text>
            {'comment' in entry ? (
              <Text>{entry.comment}</Text>
            ) : (
              <>
                <Text>
                  {entry.first_name} {entry.last_name ?? 'No last name'}
                </Text>
                <Text>{entry.email ?? 'No email'}</Text>
                <Text>{entry.salutation ?? 'No salutation'}</Text>
                <Text>{entry.place ?? 'No place'}</Text>
                <Text>{entry.state ?? 'No state'}</Text>
                <Text>{entry.zip_code ?? 'No zip code'}</Text>
              </>
            )}
          </Text>
        )}

        <Flex direction="row" gap="2" align="center" justify="between">
          <Text>ID: {entry.id}</Text>
          <Text>Created: {entry.created_at}</Text>
          {entry.moderation_score && (
            <Text color={entry.moderation_score > 0.5 ? 'red' : 'green'}>
              Moderation Score: {entry.moderation_score.toFixed(2)}
            </Text>
          )}
        </Flex>
      </Flex>
      <Flex direction="row" gap="2" align="center" justify="end">
        <ReviewActionButtons
          itemId={entry.id}
          currentStatus={entry.review_status}
          onReview={onReview}
        />
      </Flex>
    </Flex>
  );
};
