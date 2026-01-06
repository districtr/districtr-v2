'use client';
import React, {useState} from 'react';
import {Table} from '@radix-ui/themes';
import {Gallery} from '@/app/components/Static/Gallery';
import {getPlans} from '@/app/utils/api/apiHandlers/getPlans';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {PlanCard, PlanFlags, PlanTableRow} from './PlanGalleryRenderers';
import { useQuery } from '@tanstack/react-query';

export type PlanGalleryProps = {
  ids?: Array<number>;
  tags?: string[];
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
} & PlanFlags;

export const PlanGallery: React.FC<PlanGalleryProps> = ({
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
    queryFn: async () => {
      const result = await getPlans({
        ids,
        tags,
        limit: displayLimit,
        offset: page * displayLimit,
      });
      if (!result.ok) {
        throw new Error(result.error.detail);
      }
      return result.response;
    },
  });
  const showPagination = paginate && plans && (plans.length === displayLimit || page > 0);
  const noMaps = !isLoading && !plans?.length;
  return (
    <Gallery<MinPublicDocument, {ids?: number[]; tags?: string[]}, MinPublicDocument[] | null>
      title={title}
      description={description}
      paginate={paginate}
      limit={limit}
      showListView={showListView}
      filters={{ids, tags}}
      queryKey={['plans']}
      queryFunction={({filters, limit, offset}) =>
        getPlans({ids: filters.ids, tags: filters.tags, limit, offset})
      }
      selectItems={data => (data || []) as MinPublicDocument[]}
      gridRenderer={(plan, i) => <PlanCard key={i} plan={plan} {...flags} />}
      tableHeader={
        <>
          <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
          {flags.showThumbnails && <Table.ColumnHeaderCell>Thumbnail</Table.ColumnHeaderCell>}
          {flags.showTitles && <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>}
          {flags.showModule && <Table.ColumnHeaderCell>Module</Table.ColumnHeaderCell>}
          {flags.showDescriptions && <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>}
          {flags.showTags && <Table.ColumnHeaderCell>Tags</Table.ColumnHeaderCell>}
          {flags.showUpdatedAt && <Table.ColumnHeaderCell>Updated At</Table.ColumnHeaderCell>}
        </>
      }
      tableRowRenderer={(plan, i) => <PlanTableRow key={i} plan={plan} {...flags} />}
    />
  );
};
