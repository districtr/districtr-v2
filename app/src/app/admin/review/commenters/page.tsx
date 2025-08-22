'use client';
import {useState, useEffect} from 'react';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {
  getCommentersForReview,
  reviewCommenter,
  Commenter,
  ReviewStatus,
  ReviewListParams,
} from '@/app/utils/api/apiHandlers/reviewHandlers';
import ReviewStatusFilter from '../components/ReviewStatusFilter';
import ReviewActionButtons from '../components/ReviewActionButtons';
import Pagination from '../components/Pagination';

const ITEMS_PER_PAGE = 20;

export default function CommentersReviewPage() {
  const session = useCmsFormStore(state => state.session);
  const [commenters, setCommenters] = useState<Commenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [totalItems, setTotalItems] = useState(0);

  const loadCommenters = async () => {
    setLoading(true);
    setError(null);

    const params: ReviewListParams = {
      offset: currentOffset,
      limit: ITEMS_PER_PAGE,
    };

    if (reviewStatusFilter !== 'all') {
      params.review_status = reviewStatusFilter;
    }

    const result = await getCommentersForReview(params, session);

    if (result.ok) {
      setCommenters(result.data);
      // Note: The API doesn't return total count, so we estimate based on results
      setTotalItems(
        result.data.length === ITEMS_PER_PAGE
          ? currentOffset + ITEMS_PER_PAGE + 1
          : currentOffset + result.data.length
      );
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCommenters();
  }, [currentOffset, reviewStatusFilter]);

  const handleReview = async (commenterId: number, status: ReviewStatus) => {
    const result = await reviewCommenter(commenterId, status, session);

    if (result.ok) {
      // Update the commenter in the local state
      setCommenters(prev =>
        prev.map(commenter =>
          commenter.id === commenterId ? {...commenter, review_status: status} : commenter
        )
      );
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const handleStatusFilterChange = (status: ReviewStatus | 'all') => {
    setReviewStatusFilter(status);
    setCurrentOffset(0);
  };

  const handlePageChange = (offset: number) => {
    setCurrentOffset(offset);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status?: ReviewStatus) => {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Pending
        </span>
      );
    }

    const badgeClasses = {
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      reviewed: 'bg-blue-100 text-blue-800',
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClasses[status]}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatCommenterName = (commenter: Commenter) => {
    const parts = [];
    if (commenter.salutation) parts.push(commenter.salutation);
    parts.push(commenter.first_name);
    if (commenter.last_name) parts.push(commenter.last_name);
    return parts.join(' ');
  };

  const formatLocation = (commenter: Commenter) => {
    const parts = [];
    if (commenter.place) parts.push(commenter.place);
    if (commenter.state) parts.push(commenter.state);
    if (commenter.zip_code) parts.push(commenter.zip_code);
    return parts.length > 0 ? parts.join(', ') : 'Location not provided';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading commenters...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Commenters</h1>
        <p className="text-gray-600 mt-2">
          Review and moderate user accounts and their information.
        </p>
      </div>

      <ReviewStatusFilter
        currentStatus={reviewStatusFilter}
        onStatusChange={handleStatusFilterChange}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Error loading commenters: {error}</p>
          <button
            onClick={loadCommenters}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {commenters.length === 0 ? (
            <li className="px-6 py-4 text-center text-gray-500">
              No commenters found with the current filters.
            </li>
          ) : (
            commenters.map(commenter => (
              <li key={commenter.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900">
                          {formatCommenterName(commenter)}
                        </h3>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          👤 Commenter
                        </span>
                      </div>
                      {getStatusBadge(commenter.review_status)}
                    </div>

                    <div className="space-y-1 mb-3">
                      <p className="text-gray-700">
                        <span className="font-medium">Email:</span> {commenter.email}
                      </p>
                      <p className="text-gray-700">
                        <span className="font-medium">Location:</span> {formatLocation(commenter)}
                      </p>
                    </div>

                    <div className="flex items-center text-sm text-gray-500 space-x-4 mb-3">
                      <span>ID: {commenter.id}</span>
                      <span>Joined: {formatDate(commenter.created_at)}</span>
                      {commenter.moderation_score && (
                        <span
                          className={`font-medium ${
                            commenter.moderation_score > 0.5 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          Moderation Score: {commenter.moderation_score.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <ReviewActionButtons
                    itemId={commenter.id}
                    currentStatus={commenter.review_status}
                    onReview={status => handleReview(commenter.id, status)}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {commenters.length > 0 && (
        <Pagination
          currentOffset={currentOffset}
          limit={ITEMS_PER_PAGE}
          total={totalItems}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
