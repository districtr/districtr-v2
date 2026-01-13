/**
 * Generic Gallery Component
 *
 * A reusable, type-safe gallery that provides:
 * - Grid and list (table) view modes with toggle
 * - Pagination with "peek ahead" strategy for accurate next-page detection
 * - Loading, error, and empty states
 * - Flexible data fetching via queryFunction prop
 *
 * Used by PlanGallery and CommentGallery to reduce code duplication.
 *
 * @example
 * <Gallery<MyItem, MyFilters>
 *   filters={{ category: 'featured' }}
 *   queryFunction={({ filters, limit, offset }) => fetchItems(filters, limit, offset)}
 *   gridRenderer={(item) => <ItemCard item={item} />}
 * />
 */
'use client';
import React, {useMemo, useRef, useState} from 'react';
import {QueryClientProvider, useQuery} from '@tanstack/react-query';
import {queryClient} from '@/app/utils/api/queryClient';
import {Box, Button, Flex, Grid, SegmentedControl, Spinner, Table, Text} from '@radix-ui/themes';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {nanoid} from 'nanoid';

/** Returns responsive column counts based on the number of items */
const getDefaultColumns = (numItems: number) => ({
  initial: '1',
  xs: '1',
  sm: Math.min(2, Math.max(numItems ?? 2, 2)).toString(),
  md: Math.min(3, Math.max(numItems ?? 3, 2)).toString(),
  lg: Math.min(4, Math.max(numItems ?? 4, 2)).toString(),
});

export type GalleryProps<TItem, TFilters, TQueryResult = TItem[]> = {
  /** Optional title displayed above the gallery */
  title?: string;
  /** Optional description displayed below the title */
  description?: string;
  /** Optional custom header content */
  header?: React.ReactNode;
  /** Custom column configuration function for the grid */
  getColumns?: (numItems: number) => Record<string, string>;

  // Renderers
  /** Render function for each item in grid view (required) */
  gridRenderer: (item: TItem, index: number) => React.ReactNode;
  /** Render function for each item in table/list view */
  tableRowRenderer?: (item: TItem, index: number) => React.ReactNode;
  /** Table header cells for list view */
  tableHeader?: React.ReactNode;

  // Data fetching
  /** Filter object passed to queryFunction */
  filters: TFilters;
  /** Async function to fetch data. Receives filters, limit, and offset. */
  queryFunction: (args: {filters: TFilters; limit: number; offset: number}) => Promise<TQueryResult>;
  /** Extract items array from query result (for non-standard response shapes) */
  selectItems?: (data: TQueryResult | undefined) => TItem[];
  /** Determine if response represents an error state */
  isError?: (data: TQueryResult | undefined) => boolean;
  /** Extract error message from response */
  errorMessage?: (data: TQueryResult | undefined) => React.ReactNode;
  /** Additional query key segments for cache differentiation */
  queryKey?: unknown[];

  // Behavior
  /** Enable pagination controls */
  paginate?: boolean;
  /** Number of items per page (default: 12) */
  limit?: number;
  /** Show grid/list view toggle */
  showListView?: boolean;
  /** Initial view mode (default: 'grid') */
  initialView?: 'grid' | 'list';
  /** Custom empty state content */
  emptyState?: React.ReactNode;
};

export function GalleryInner<TItem, TFilters, TQueryResult = TItem[]>({
  title,
  description,
  header,
  gridRenderer,
  tableRowRenderer,
  tableHeader,
  filters,
  queryFunction,
  selectItems,
  isError,
  errorMessage,
  queryKey,
  paginate,
  limit = 12,
  showListView = false,
  getColumns = getDefaultColumns,
  initialView = 'grid',
  emptyState,
}: GalleryProps<TItem, TFilters, TQueryResult>): React.ReactElement | null {
  // Unique ID to avoid query key collisions when multiple galleries exist on the same page
  const galleryQueryId = useRef(nanoid());
  const [page, setPage] = useState(0);
  const [displayLimit] = useState<number>(Number(limit) || 12);
  const [view, setView] = useState<'grid' | 'list'>(initialView);

  const {data, isLoading} = useQuery({
    queryKey: ['gallery', galleryQueryId, ...(queryKey ?? []), filters, page, displayLimit],
    // "Peek ahead" pagination: request limit+1 items to detect if more pages exist
    // This avoids showing a "Next" button that leads to an empty page
    queryFn: () => queryFunction({filters, limit: displayLimit + 1, offset: page * displayLimit}),
  });

  const {items, hasNextPage} = useMemo(() => {
    const rawItems = selectItems ? selectItems(data) : ((data as unknown as TItem[]) ?? []);
    // If we got more items than displayLimit, there's another page
    const hasMore = rawItems.length > displayLimit;
    return {
      // Only display up to displayLimit items (hide the "peek" item)
      items: hasMore ? rawItems.slice(0, displayLimit) : rawItems,
      hasNextPage: hasMore,
    };
  }, [data, selectItems, displayLimit]);

  const computedIsError = isError ? isError(data) : false;
  const computedErrorMessage = errorMessage ? errorMessage(data) : undefined;

  const showPagination = !!(paginate && (hasNextPage || page > 0));
  const noItems = !isLoading && (!items || items.length === 0);

  if (isLoading) {
    return (
      <Flex direction="column" align="center" justify="center" className="w-full">
        <Spinner size="3" />
        <Text>Loading…</Text>
      </Flex>
    );
  }

  if (computedIsError) {
    return (
      <Flex direction="column" align="center" justify="center" className="w-full">
        <Text>Error loading items</Text>
        {computedErrorMessage}
      </Flex>
    );
  }

  return (
    <>
      {(title || description) && (
        <ContentSection title={title ?? ''}>
          {description && <Text size="5">{description}</Text>}
        </ContentSection>
      )}
      {header}

      {!!(showListView && !noItems && tableRowRenderer) && (
        <Flex direction="row" gap="2" align="center" pt="4">
          <Text size="2" color="gray">
            View type:
          </Text>
          <SegmentedControl.Root
            value={view}
            onValueChange={value => setView(value as 'grid' | 'list')}
            className="w-min"
            size="2"
          >
            <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
            <SegmentedControl.Item value="list">List</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
      )}

      {!!(!noItems && view === 'grid') && (
        <Grid
          columns={getColumns(items?.length ?? 0)}
          gap="4"
          pt="4"
        >
          {items?.map((item, i) => <Box key={i}>{gridRenderer(item, i)}</Box>)}
        </Grid>
      )}

      {!!(!noItems && view === 'list' && tableRowRenderer) && (
        <Table.Root className="w-full">
          {tableHeader && (
            <Table.Header>
              <Table.Row>{tableHeader}</Table.Row>
            </Table.Header>
          )}
          <Table.Body>{items?.map((item, i) => tableRowRenderer(item, i))}</Table.Body>
        </Table.Root>
      )}

      {!!(showPagination && !noItems) && (
        <Flex justify="start" mt="4" gap="4">
          <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
            Previous
          </Button>
          <Button onClick={() => setPage(page + 1)} disabled={!hasNextPage}>
            Next
          </Button>
        </Flex>
      )}

      {!!noItems && (
        <Flex justify="center" mt="4">
          {emptyState ?? (
            <Text size="2" color="gray">
              No items found.
            </Text>
          )}
        </Flex>
      )}
    </>
  );
}

/**
 * Gallery wrapper that provides QueryClientProvider context.
 * Use this component when the gallery is rendered outside of an existing QueryClientProvider.
 */
export function Gallery<TItem, TFilters, TQueryResult = TItem[]>(
  props: GalleryProps<TItem, TFilters, TQueryResult>
) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* eslint-disable-next-line react/jsx-props-no-spreading */}
      <GalleryInner {...props} />
    </QueryClientProvider>
  );
}
