import {ReviewStatus} from '@/app/utils/api/apiHandlers/reviewHandlers';
import { Flex, Text } from '@radix-ui/themes';
import { Button } from '@radix-ui/themes';

interface ReviewStatusFilterProps {
  currentStatus: ReviewStatus | 'all';
  onStatusChange: (status: ReviewStatus | 'all') => void;
}

const statusOptions = [
  {value: 'all', label: 'All Statuses', color: 'gray'},
  {value: 'approved', label: 'Approved', color: 'green'},
  {value: 'rejected', label: 'Rejected', color: 'red'},
  {value: 'reviewed', label: 'Reviewed', color: 'blue'},
] as const;

export default function ReviewStatusFilter({
  currentStatus,
  onStatusChange,
}: ReviewStatusFilterProps) {
  return (
    <Flex direction="row" gap="2">
      <Text>Filter by Review Status</Text>
      <Flex direction="row" gap="2">
        {statusOptions.map(option => (
          <Button
            key={option.value}
            onClick={() =>
              onStatusChange(option.value === 'all' ? 'all' : (option.value as ReviewStatus))
            }
            variant={currentStatus === option.value ? 'solid' : 'outline'}
            size="2"
            color={option.color as any}
          >
            {option.label}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}
