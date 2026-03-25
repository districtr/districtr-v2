import {Button, Flex, Text, Box} from '@radix-ui/themes';

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
    <Flex
      direction="row"
      gap="2"
      align="start"
      justify="between"
      className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6"
    >
      <Flex
        direction="row"
        gap="2"
        align="start"
        justify="between"
        className="flex-1 flex justify-between sm:hidden"
      >
        <Button onClick={handlePrevious} disabled={!hasPrev}>
          Previous
        </Button>
        <Button onClick={handleNext} disabled={!hasNext}>
          Next
        </Button>
      </Flex>
      <Flex
        direction="row"
        gap="2"
        align="start"
        justify="between"
        className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between"
      >
        <Box>
          <Text size="1">
            Showing <Text>{currentOffset + 1}</Text> to{' '}
            <Text>{Math.min(currentOffset + limit, total)}</Text> of <Text>{total}</Text> results
          </Text>
        </Box>
        <Box>
          <Flex
            direction="row"
            gap="2"
            align="start"
            justify="between"
            className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
          >
            <Button onClick={handlePrevious} disabled={!hasPrev} size="1" variant="soft">
              <span className="sr-only">Previous</span>←
            </Button>

            {getVisiblePages().map(page => (
              <Button
                key={page}
                onClick={() => handlePageClick(page)}
                size="1"
                variant={page === currentPage ? 'solid' : 'soft'}
              >
                {page}
              </Button>
            ))}

            <Button onClick={handleNext} disabled={!hasNext} size="1" variant="soft">
              <span className="sr-only">Next</span>→
            </Button>
          </Flex>
        </Box>
      </Flex>
    </Flex>
  );
}
