import {useState} from 'react';
import {ReviewStatus, REVIEW_STATUS_ENUM} from '@/app/utils/api/apiHandlers/reviewHandlers';
import {Button, Flex} from '@radix-ui/themes';

interface ReviewActionButtonsProps {
  itemId: number;
  currentStatus?: ReviewStatus;
  onReview: (status: ReviewStatus) => Promise<void>;
  disabled?: boolean;
}

const buttonEntries = [
  {
    status: REVIEW_STATUS_ENUM.APPROVED,
    label: 'Approve',
    color: 'green',
  },
  {
    status: REVIEW_STATUS_ENUM.REJECTED,
    label: 'Reject',
    color: 'red',
  },
  {
    status: REVIEW_STATUS_ENUM.REVIEWED,
    label: 'Mark Reviewed',
    color: 'blue',
  },
];

export default function ReviewActionButtons({
  itemId,
  currentStatus,
  onReview,
  disabled = false,
}: ReviewActionButtonsProps) {
  const [loading, setLoading] = useState<ReviewStatus | null>(null);

  const handleReview = async (status: ReviewStatus) => {
    setLoading(status);
    try {
      await onReview(status);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Flex direction="row" gap="2">
      {buttonEntries.map(entry => (
        <Button
          key={entry.status}
          onClick={() => handleReview(entry.status)}
          disabled={loading === entry.status}
          variant={currentStatus === entry.status ? 'solid' : 'outline'}
          size="1"
          color={entry.color as any}
        >
          {entry.label}
        </Button>
      ))}
    </Flex>
  );
}
