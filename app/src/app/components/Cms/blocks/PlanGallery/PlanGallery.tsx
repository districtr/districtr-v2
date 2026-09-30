'use client';
import React from 'react';
import {Table} from '@radix-ui/themes';
import {Gallery} from '@/app/components/Static/Gallery';
import {getPlans, type PlanQuery} from '@/app/utils/api/apiHandlers/getPlans';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {PlanCard, PlanTableRow} from './PlanGalleryRenderers';

export type PlanGalleryProps = {
  /** Curated gallery: these maps, in this order. */
  ids?: Array<number> | null;
  /** Portal gallery (injected by the CMS on portal pages): this portal's
   * submissions at one status. */
  portalId?: string | null;
  draftStatus?: 'ready_to_share' | 'in_progress' | null;
  title: string;
  description: string;
  limit?: number;
};

export const PlanGallery: React.FC<PlanGalleryProps> = ({
  ids,
  portalId,
  draftStatus,
  title,
  description,
  limit = 12,
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
      limit={limit}
      filters={query}
      queryKey={['plans']}
      queryFunction={async ({filters, limit, offset}) => {
        const result = await getPlans({...filters, limit, offset});
        return result?.ok ? result.response : null;
      }}
      selectItems={data => (data || []) as MinPublicDocument[]}
      gridRenderer={(plan, i) => <PlanCard key={i} plan={plan} />}
      tableHeader={
        <>
          <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Thumbnail</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Module</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Tags</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Updated At</Table.ColumnHeaderCell>
        </>
      }
      tableRowRenderer={(plan, i) => <PlanTableRow key={i} plan={plan} />}
    />
  );
};
