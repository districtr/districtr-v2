interface PaginationProps {
  currentOffset: number;
  limit: number;
  total: number;
  onPageChange: (offset: number) => void;
}

export default function Pagination({currentOffset, limit, total, onPageChange}: PaginationProps) {
  const currentPage = Math.floor(currentOffset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const hasNext = currentOffset + limit < total;
  const hasPrev = currentOffset > 0;

  const handlePrevious = () => {
    if (hasPrev) {
      onPageChange(Math.max(0, currentOffset - limit));
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onPageChange(currentOffset + limit);
    }
  };

  const handlePageClick = (page: number) => {
    onPageChange((page - 1) * limit);
  };

  const getVisiblePages = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
      <div className="flex-1 flex justify-between sm:hidden">
        <button
          onClick={handlePrevious}
          disabled={!hasPrev}
          className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
            hasPrev
              ? 'text-gray-700 bg-white hover:bg-gray-50'
              : 'text-gray-400 bg-gray-100 cursor-not-allowed'
          }`}
        >
          Previous
        </button>
        <button
          onClick={handleNext}
          disabled={!hasNext}
          className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
            hasNext
              ? 'text-gray-700 bg-white hover:bg-gray-50'
              : 'text-gray-400 bg-gray-100 cursor-not-allowed'
          }`}
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{currentOffset + 1}</span> to{' '}
            <span className="font-medium">{Math.min(currentOffset + limit, total)}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </p>
        </div>
        <div>
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
            <button
              onClick={handlePrevious}
              disabled={!hasPrev}
              className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 text-sm font-medium ${
                hasPrev
                  ? 'text-gray-500 bg-white hover:bg-gray-50'
                  : 'text-gray-300 bg-gray-100 cursor-not-allowed'
              }`}
            >
              <span className="sr-only">Previous</span>←
            </button>

            {getVisiblePages().map(page => (
              <button
                key={page}
                onClick={() => handlePageClick(page)}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                  page === currentPage
                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={handleNext}
              disabled={!hasNext}
              className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 text-sm font-medium ${
                hasNext
                  ? 'text-gray-500 bg-white hover:bg-gray-50'
                  : 'text-gray-300 bg-gray-100 cursor-not-allowed'
              }`}
            >
              <span className="sr-only">Next</span>→
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
