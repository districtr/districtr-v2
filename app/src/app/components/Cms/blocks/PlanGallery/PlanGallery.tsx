'use client';
import React from 'react';
import {Table} from '@radix-ui/themes';
import {Gallery} from '@/app/components/Static/Gallery';
import {getPlans, type PlanQuery} from '@/app/utils/api/apiHandlers/getPlans';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {PlanCard, PlanFlags, PlanTableRow} from './PlanGalleryRenderers';

export type PlanGalleryProps = {
  /** Curated gallery: these maps, in this order. */
  ids?: Array<number> | null;
  /** Portal gallery (injected by the CMS on portal pages): this portal's
   * submissions at one status. */
  portalId?: string | null;
  draftStatus?: 'ready_to_share' | 'in_progress' | null;
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
} & PlanFlags;

export const PlanGallery: React.FC<PlanGalleryProps> = ({
  ids,
  portalId,
  draftStatus,
  title,
  description,
  paginate,
  limit = 12,
  showListView = false,
  ...flags
}: PlanGalleryProps) => {
  const query: PlanQuery | null = ids?.length
    ? {ids}
    : portalId
      ? {portalId, draftStatus: draftStatus ?? 'ready_to_share'}
      : null;
  // Nothing to list (e.g. a portal gallery off a portal page).
  if (!query) return null;
  return (
    <Gallery<MinPublicDocument, PlanQuery, MinPublicDocument[] | null>
      title={title}
      description={description}
      paginate={paginate}
      limit={limit}
      showListView={showListView}
      filters={query}
      queryKey={['plans']}
      queryFunction={async ({filters, limit, offset}) => {
        const result = await getPlans({...filters, limit, offset});
        return result?.ok ? result.response : null;
      }}
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
