'use client';
import React from 'react';
import {Table} from '@radix-ui/themes';
import {Gallery} from '@/app/components/Static/Gallery';
import {getPlans} from '@/app/utils/api/apiHandlers/getPlans';
import {getGallery} from '@/app/utils/api/cmsContent';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {PlanCard, PlanFlags, PlanTableRow} from './PlanGalleryRenderers';

type PlanGalleryFilters = {
  ids?: number[] | null;
  tags?: string[] | null;
  gallerySlug?: string | null;
};

export type PlanGalleryProps = {
  ids?: Array<number> | null;
  tags?: string[] | null;
  /**
   * Slug of a curated CMS gallery (/api/galleries/<slug>); its entries
   * replace the ids/tags filters. Anonymous fetch: public galleries only.
   */
  gallerySlug?: string | null;
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
} & PlanFlags;

export const PlanGallery: React.FC<PlanGalleryProps> = ({
  ids,
  tags,
  gallerySlug,
  title,
  description,
  paginate,
  limit = 12,
  showListView = false,
  ...flags
}: PlanGalleryProps) => {
  return (
    <Gallery<MinPublicDocument, PlanGalleryFilters, MinPublicDocument[] | null>
      title={title}
      description={description}
      paginate={paginate}
      limit={limit}
      showListView={showListView}
      filters={{ids, tags, gallerySlug}}
      queryKey={['plans']}
      queryFunction={async ({filters, limit, offset}) => {
        let ids = filters.ids ?? undefined;
        if (filters.gallerySlug) {
          const gallery = await getGallery(filters.gallerySlug);
          ids = gallery?.entries.map(entry => entry.document_public_id) ?? [];
          // Empty/missing gallery must NOT fall through to an unfiltered
          // plans query (getPlans would return ALL public documents).
          if (!ids.length) return [];
        }
        const result = await getPlans({ids, tags: filters.tags ?? undefined, limit, offset});
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
