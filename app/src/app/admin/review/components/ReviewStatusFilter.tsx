import {ReviewStatus} from '@/app/utils/api/apiHandlers/reviewHandlers';

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
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Filter by Review Status
      </label>
      <div className="flex flex-wrap gap-2">
        {statusOptions.map(option => (
          <button
            key={option.value}
            onClick={() =>
              onStatusChange(option.value === 'all' ? 'all' : (option.value as ReviewStatus))
            }
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
              currentStatus === option.value
                ? `bg-${option.color}-100 text-${option.color}-800 ring-2 ring-${option.color}-500`
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
