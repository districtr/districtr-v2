'use client';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {Box, Button, Flex, Grid, SegmentedControl, Table, Text} from '@radix-ui/themes';
import React, {useState} from 'react';
import {QueryClientProvider, useQuery} from '@tanstack/react-query';
import {getPlans} from '@/app/utils/api/apiHandlers/getPlans';
import {queryClient} from '@/app/utils/api/queryClient';
import {CDN_URL} from '@/app/utils/api/constants';
import {useRouter} from 'next/navigation';

export type PlanGalleryProps = {
  ids?: Array<number>;
  tags?: string[];
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
} & PlanFlags;

export type PlanFlags = {
  showThumbnails?: boolean;
  showTitles?: boolean;
  showDescriptions?: boolean;
  showUpdatedAt?: boolean;
  showTags?: boolean;
  showModule?: boolean;
};

const FALLBACK_IMAGE = '/home-megaphone-square.png';
const FALLBACK_IMAGE_URL =
  typeof window !== 'undefined' ? new URL(FALLBACK_IMAGE, window.location.origin).toString() : '';

export const PlanGalleryInner = ({
  ids,
  tags,
  title,
  description,
  paginate,
  limit = 12,
  showListView = false,
  ...flags
}: PlanGalleryProps) => {
  const [page, setPage] = useState(0);
  const [displayLimit, _setDisplayLimit] = useState(+limit);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const {data: plans, isLoading} = useQuery({
    queryKey: ['plans', ids, tags, page],
    queryFn: () => getPlans({ids, tags, limit: displayLimit, offset: page * displayLimit}),
  });
  const showPagination = paginate && plans && (plans.length === displayLimit || page > 0);
  const noMaps = !isLoading && !plans?.length;
  return (
    <>
      <ContentSection title={title}>
        <Text size="5">{description}</Text>
      </ContentSection>
      {!!(showListView && !noMaps) && (
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
      {!!(!noMaps && view === 'grid') && (
        <Grid
          columns={{
            initial: '1',
            xs: '1',
            sm: Math.min(2, Math.max(plans?.length ?? 2, 2)).toString(),
            md: Math.min(3, Math.max(plans?.length ?? 3, 2)).toString(),
            lg: Math.min(4, Math.max(plans?.length ?? 4, 2)).toString(),
            xl: Math.min(6, Math.max(plans?.length ?? 6, 2)).toString(),
          }}
          gap="4"
          pt="4"
        >
          {plans?.map((plan, i) => <PlanCard plan={plan} key={i} {...flags} />)}
        </Grid>
      )}
      {!!(!noMaps && view === 'list') && (
        <Table.Root className="w-full">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
              {flags.showThumbnails && <Table.ColumnHeaderCell>Thumbnail</Table.ColumnHeaderCell>}
              {flags.showTitles && <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>}
              {flags.showModule && <Table.ColumnHeaderCell>Module</Table.ColumnHeaderCell>}
              {flags.showDescriptions && (
                <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
              )}
              {flags.showTags && <Table.ColumnHeaderCell>Tags</Table.ColumnHeaderCell>}
              {flags.showUpdatedAt && <Table.ColumnHeaderCell>Updated At</Table.ColumnHeaderCell>}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {plans?.map((plan, i) => <PlanTableRow plan={plan} key={i} {...flags} />)}
          </Table.Body>
        </Table.Root>
      )}
      {!!(showPagination && !noMaps) && (
        <Flex justify="start" mt="4" gap="4">
          <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
            Previous
          </Button>
          <Button onClick={() => setPage(page + 1)} disabled={plans.length < displayLimit}>
            Next
          </Button>
        </Flex>
      )}
      {!!noMaps && (
        <Flex justify="center" mt="4">
          <Text size="2" color="gray">
            No maps found. Check back later!
          </Text>
        </Flex>
      )}
    </>
  );
};

export const PlanGallery = (props: PlanGalleryProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <PlanGalleryInner {...props} />
    </QueryClientProvider>
  );
};

export const PlanCard = ({plan, ...flags}: {plan: MinPublicDocument} & PlanFlags) => {
  return (
    <a href={`/map/${plan.public_id}`}>
      <Flex
        direction="column"
        gap="4"
        className="h-full bg-gray-50 rounded-xl shadow-sm hover:shadow-xl
    hover:bg-blue-50 hover:cursor-pointer hover:scale-105 transition-all duration-300"
      >
        {/* box with a 16:9 aspect ratio and overflow hidden */}
        {!!flags.showThumbnails && (
          <Box
            className="w-full relative overflow-hidden aspect-video border-2 border-b-0 border-gray-50 bg-white"
            style={{
              backgroundImage: `url(${CDN_URL}/thumbnails/${plan.public_id}.png), url(${FALLBACK_IMAGE_URL})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          ></Box>
        )}
        <Box px="4" py="2">
          <Flex direction="column" gap="2">
            {plan.public_id && <Text size="1">Map ID:{plan.public_id}</Text>}
            {!!flags.showTitles && plan.map_metadata?.name && (
              <Text size="5">{plan.map_metadata?.name}</Text>
            )}
            {!!flags.showModule && plan.map_module && (
              <Text size="2" color="gray">
                {plan.map_module}
              </Text>
            )}
            {!!flags.showDescriptions && plan.map_metadata?.description && (
              <Text size="2" color="gray">
                {plan.map_metadata?.description}
              </Text>
            )}
            {!!flags.showTags && plan.map_metadata?.tags && (
              <Text size="2" color="gray">
                {plan.map_metadata?.tags}
              </Text>
            )}
            {!!flags.showUpdatedAt && plan.updated_at && (
              <Text size="2" color="gray">
                Last updated: {new Date(plan.updated_at).toLocaleDateString()}
              </Text>
            )}
          </Flex>
        </Box>
      </Flex>
    </a>
  );
};

export const PlanTableRow = ({plan, ...flags}: {plan: MinPublicDocument} & PlanFlags) => {
  const router = useRouter();
  return (
    <Table.Row onClick={() => router.push(`/map/${plan.public_id}`)}>
      <Table.Cell>{plan.public_id}</Table.Cell>
      {!!flags.showThumbnails && (
        <Table.Cell>
          <Box
            className="w-full relative overflow-hidden aspect-video border-2 border-gray-50 bg-white size-8"
            style={{
              backgroundImage: `url(${CDN_URL}/thumbnails/${plan.public_id}.png), url(${FALLBACK_IMAGE_URL})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          ></Box>
        </Table.Cell>
      )}
      {!!flags.showTitles && <Table.Cell>{plan.map_metadata?.name ?? ''}</Table.Cell>}
      {!!flags.showModule && <Table.Cell>{plan.map_module ?? ''}</Table.Cell>}
      {!!flags.showDescriptions && <Table.Cell>{plan.map_metadata?.description ?? ''}</Table.Cell>}
      {!!flags.showTags && <Table.Cell>{plan.map_metadata?.tags ?? ''}</Table.Cell>}
      {!!flags.showUpdatedAt && (
        <Table.Cell>{new Date(plan.updated_at).toLocaleDateString() ?? ''}</Table.Cell>
      )}
    </Table.Row>
  );
};
