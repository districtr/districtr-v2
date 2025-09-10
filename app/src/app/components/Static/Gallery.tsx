'use client';
import React, {useMemo, useRef, useState} from 'react';
import {QueryClientProvider, useQuery} from '@tanstack/react-query';
import {queryClient} from '@/app/utils/api/queryClient';
import {Box, Button, Flex, Grid, SegmentedControl, Spinner, Table, Text} from '@radix-ui/themes';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {nanoid} from 'nanoid';

export type GalleryProps<TItem, TFilters, TQueryResult = TItem[]> = {
  title?: string;
  description?: string;
  header?: React.ReactNode;

  // Renderers
  gridRenderer: (item: TItem, index: number) => React.ReactNode;
  tableRowRenderer?: (item: TItem, index: number) => React.ReactNode;
  tableHeader?: React.ReactNode;

  // Data fetching
  filters: TFilters;
  queryFunction: (args: {
    filters: TFilters;
    limit: number;
    offset: number;
  }) => Promise<TQueryResult>;
  selectItems?: (data: TQueryResult | undefined) => TItem[];
  isError?: (data: TQueryResult | undefined) => boolean;
  errorMessage?: (data: TQueryResult | undefined) => React.ReactNode;
  queryKey?: unknown[];

  // Behavior
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
  initialView?: 'grid' | 'list';
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
  initialView = 'grid',
  emptyState,
}: GalleryProps<TItem, TFilters, TQueryResult>): React.ReactElement | null {
  // avoid collisions on query key
  const galleryQueryId = useRef(nanoid());
  const [page, setPage] = useState(0);
  const [displayLimit] = useState<number>(Number(limit) || 12);
  const [view, setView] = useState<'grid' | 'list'>(initialView);

  const {data, isLoading} = useQuery({
    queryKey: ['gallery', galleryQueryId, ...(queryKey ?? []), filters, page, displayLimit],
    queryFn: () => queryFunction({filters, limit: displayLimit, offset: page * displayLimit}),
  });

  const items = useMemo<TItem[]>(() => {
    if (selectItems) return selectItems(data);
    return (data as unknown as TItem[]) ?? [];
  }, [data, selectItems]);
  const computedIsError = isError ? isError(data) : false;
  const computedErrorMessage = errorMessage ? errorMessage(data) : undefined;

  const showPagination = !!(paginate && items && (items.length === displayLimit || page > 0));
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
          columns={{
            initial: '1',
            xs: '1',
            sm: Math.min(2, Math.max(items?.length ?? 2, 2)).toString(),
            md: Math.min(3, Math.max(items?.length ?? 3, 2)).toString(),
            lg: Math.min(4, Math.max(items?.length ?? 4, 2)).toString(),
            xl: Math.min(6, Math.max(items?.length ?? 6, 2)).toString(),
          }}
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
          <Button onClick={() => setPage(page + 1)} disabled={(items?.length ?? 0) < displayLimit}>
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
