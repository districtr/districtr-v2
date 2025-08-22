'use client';
import {useState, useEffect} from 'react';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {
  getCommentsForReview,
  reviewComment,
  Comment,
  ReviewStatus,
  ReviewListParams,
} from '@/app/utils/api/apiHandlers/reviewHandlers';
import ReviewStatusFilter from '../components/ReviewStatusFilter';
import ReviewActionButtons from '../components/ReviewActionButtons';
import Pagination from '../components/Pagination';

const ITEMS_PER_PAGE = 20;

export default function CommentsReviewPage() {
  const session = useCmsFormStore(state => state.session);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [totalItems, setTotalItems] = useState(0);

  const loadComments = async () => {
    setLoading(true);
    setError(null);

    const params: ReviewListParams = {
      offset: currentOffset,
      limit: ITEMS_PER_PAGE,
    };

    if (reviewStatusFilter !== 'all') {
      params.review_status = reviewStatusFilter;
    }

    const result = await getCommentsForReview(params, session);

    if (result.ok) {
      setComments(result.data);
      // Note: The API doesn't return total count, so we estimate based on results
      // In a real implementation, the API should return pagination metadata
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
    loadComments();
  }, [currentOffset, reviewStatusFilter]);

  const handleReview = async (commentId: number, status: ReviewStatus) => {
    const result = await reviewComment(commentId, status, session);

    if (result.ok) {
      // Update the comment in the local state
      setComments(prev =>
        prev.map(comment =>
          comment.id === commentId ? {...comment, review_status: status} : comment
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading comments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Comments</h1>
        <p className="text-gray-600 mt-2">
          Review and moderate user comments for appropriate content.
        </p>
      </div>

      <ReviewStatusFilter
        currentStatus={reviewStatusFilter}
        onStatusChange={handleStatusFilterChange}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Error loading comments: {error}</p>
          <button onClick={loadComments} className="mt-2 text-red-600 hover:text-red-800 underline">
            Try again
          </button>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {comments.length === 0 ? (
            <li className="px-6 py-4 text-center text-gray-500">
              No comments found with the current filters.
            </li>
          ) : (
            comments.map(comment => (
              <li key={comment.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {comment.title}
                      </h3>
                      {getStatusBadge(comment.review_status)}
                    </div>

                    <p className="text-gray-700 mb-3 line-clamp-3">{comment.comment}</p>

                    <div className="flex items-center text-sm text-gray-500 space-x-4 mb-3">
                      <span>ID: {comment.id}</span>
                      <span>Created: {formatDate(comment.created_at)}</span>
                      {comment.moderation_score && (
                        <span
                          className={`font-medium ${
                            comment.moderation_score > 0.5 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          Moderation Score: {comment.moderation_score.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <ReviewActionButtons
                    itemId={comment.id}
                    currentStatus={comment.review_status}
                    onReview={status => handleReview(comment.id, status)}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {comments.length > 0 && (
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
