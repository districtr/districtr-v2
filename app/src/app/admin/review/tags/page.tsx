'use client';
import {useState, useEffect} from 'react';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {
  getTagsForReview,
  reviewTag,
  Tag,
  ReviewStatus,
  ReviewListParams,
} from '@/app/utils/api/apiHandlers/reviewHandlers';
import ReviewStatusFilter from '../components/ReviewStatusFilter';
import ReviewActionButtons from '../components/ReviewActionButtons';
import Pagination from '../components/Pagination';

const ITEMS_PER_PAGE = 20;

export default function TagsReviewPage() {
  const session = useCmsFormStore(state => state.session);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [totalItems, setTotalItems] = useState(0);

  const loadTags = async () => {
    setLoading(true);
    setError(null);

    const params: ReviewListParams = {
      offset: currentOffset,
      limit: ITEMS_PER_PAGE,
    };

    if (reviewStatusFilter !== 'all') {
      params.review_status = reviewStatusFilter;
    }

    const result = await getTagsForReview(params, session);

    if (result.ok) {
      setTags(result.data);
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
    loadTags();
  }, [currentOffset, reviewStatusFilter]);

  const handleReview = async (tagId: number, status: ReviewStatus) => {
    const result = await reviewTag(tagId, status, session);

    if (result.ok) {
      // Update the tag in the local state
      setTags(prev => prev.map(tag => (tag.id === tagId ? {...tag, review_status: status} : tag)));
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
        <div className="text-gray-500">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Tags</h1>
        <p className="text-gray-600 mt-2">Review and moderate tags used to categorize comments.</p>
      </div>

      <ReviewStatusFilter
        currentStatus={reviewStatusFilter}
        onStatusChange={handleStatusFilterChange}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Error loading tags: {error}</p>
          <button onClick={loadTags} className="mt-2 text-red-600 hover:text-red-800 underline">
            Try again
          </button>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {tags.length === 0 ? (
            <li className="px-6 py-4 text-center text-gray-500">
              No tags found with the current filters.
            </li>
          ) : (
            tags.map(tag => (
              <li key={tag.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900">{tag.slug}</h3>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          🏷️ Tag
                        </span>
                      </div>
                      {getStatusBadge(tag.review_status)}
                    </div>

                    <div className="flex items-center text-sm text-gray-500 space-x-4 mb-3">
                      <span>ID: {tag.id}</span>
                      <span>Created: {formatDate(tag.created_at)}</span>
                      {tag.moderation_score && (
                        <span
                          className={`font-medium ${
                            tag.moderation_score > 0.5 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          Moderation Score: {tag.moderation_score.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <ReviewActionButtons
                    itemId={tag.id}
                    currentStatus={tag.review_status}
                    onReview={status => handleReview(tag.id, status)}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {tags.length > 0 && (
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
