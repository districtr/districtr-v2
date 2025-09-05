import {REVIEW_STATUS_ENUM, ReviewStatus} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {CheckIcon, Cross2Icon, EyeOpenIcon, QuestionMarkCircledIcon} from '@radix-ui/react-icons';
import {Button, Flex, Heading, IconButton, Popover, Text} from '@radix-ui/themes';
import {useState} from 'react';

interface ReviewBadgeProps {
  status: ReviewStatus | null;
  onReview: (status: ReviewStatus) => Promise<void | void[]> | void;
  title?: string;
}

export const ReviewBadge: React.FC<ReviewBadgeProps> = ({status, onReview, title}) => {
  const [loading, setLoading] = useState<ReviewStatus | null>(null);

  return (
    <Popover.Root>
      <Popover.Trigger>
        <IconButton variant="outline" className="ml-1">
          <ReviewIcon status={status} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content
        className={loading ? 'opacity-50 pointer-events-none' : 'opacity-100 pointer-events-auto'}
      >
        <Flex direction="column" gap="2">
          {title && (
            <Heading size="2" as="h3">
              {title}
            </Heading>
          )}
          <Text size="2">
            Current Status: {status ?? 'Not reviewed'}
          </Text>
          <ReviewButtons status={status} onReview={onReview} />
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};

export const ReviewButtons: React.FC<Pick<ReviewBadgeProps, 'status' | 'onReview'>> = ({
  status,
  onReview,
}) => {
  return (
    <>
      <Button
        color="green"
        variant={status === REVIEW_STATUS_ENUM.APPROVED ? 'solid' : 'outline'}
        onClick={() => onReview(REVIEW_STATUS_ENUM.APPROVED)}
      >
        Approve
      </Button>
      <Button
        color="red"
        variant={status === REVIEW_STATUS_ENUM.REJECTED ? 'solid' : 'outline'}
        onClick={() => onReview(REVIEW_STATUS_ENUM.REJECTED)}
      >
        Reject
      </Button>
      <Button
        color="blue"
        variant={status === REVIEW_STATUS_ENUM.REVIEWED ? 'solid' : 'outline'}
        onClick={() => onReview(REVIEW_STATUS_ENUM.REVIEWED)}
      >
        Mark Reviewed
      </Button>
    </>
  );
};
export const ReviewIcon: React.FC<{
  status: ReviewStatus | null;
}> = ({status}) => {
  switch (status) {
    case 'APPROVED':
      return <CheckIcon className="inline" color="green" />;
    case 'REJECTED':
      return <Cross2Icon className="inline" color="red" />;
    case 'REVIEWED':
      return <EyeOpenIcon className="inline" color="blue" />;
    default:
      return <QuestionMarkCircledIcon className="inline" color="gray" />;
  }
};
