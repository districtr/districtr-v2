import {useState} from 'react';
import {ReviewStatus} from '@/app/utils/api/apiHandlers/reviewHandlers';

interface ReviewActionButtonsProps {
  itemId: number;
  currentStatus?: ReviewStatus;
  onReview: (status: ReviewStatus) => Promise<void>;
  disabled?: boolean;
}

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

  const getButtonClass = (status: ReviewStatus, isActive: boolean) => {
    const baseClasses =
      'px-3 py-1 rounded text-sm font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

    if (isActive) {
      switch (status) {
        case 'approved':
          return `${baseClasses} bg-green-100 text-green-800 border border-green-300`;
        case 'rejected':
          return `${baseClasses} bg-red-100 text-red-800 border border-red-300`;
        case 'reviewed':
          return `${baseClasses} bg-blue-100 text-blue-800 border border-blue-300`;
      }
    }

    switch (status) {
      case 'approved':
        return `${baseClasses} bg-white text-green-700 border border-green-300 hover:bg-green-50`;
      case 'rejected':
        return `${baseClasses} bg-white text-red-700 border border-red-300 hover:bg-red-50`;
      case 'reviewed':
        return `${baseClasses} bg-white text-blue-700 border border-blue-300 hover:bg-blue-50`;
    }
  };

  return (
    <div className="flex space-x-2">
      <button
        onClick={() => handleReview('approved')}
        disabled={disabled || loading === 'approved'}
        className={getButtonClass('approved', currentStatus === 'approved')}
      >
        {loading === 'approved' ? '⏳' : currentStatus === 'approved' ? '✅ Approved' : 'Approve'}
      </button>

      <button
        onClick={() => handleReview('rejected')}
        disabled={disabled || loading === 'rejected'}
        className={getButtonClass('rejected', currentStatus === 'rejected')}
      >
        {loading === 'rejected' ? '⏳' : currentStatus === 'rejected' ? '❌ Rejected' : 'Reject'}
      </button>

      <button
        onClick={() => handleReview('reviewed')}
        disabled={disabled || loading === 'reviewed'}
        className={getButtonClass('reviewed', currentStatus === 'reviewed')}
      >
        {loading === 'reviewed'
          ? '⏳'
          : currentStatus === 'reviewed'
            ? '👁️ Reviewed'
            : 'Mark Reviewed'}
      </button>
    </div>
  );
}
