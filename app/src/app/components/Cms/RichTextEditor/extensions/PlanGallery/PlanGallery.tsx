'use client';
import React from 'react';
import {Table} from '@radix-ui/themes';
import {Gallery} from '@/app/components/Static/Gallery';
import {getPlans} from '@/app/utils/api/apiHandlers/getPlans';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {
  DRAFT_STATUSES,
  SUBMITTED_STATUSES,
  type DraftStatus,
} from '@constants/document/draftStatus';
import {PlanCard, PlanFlags, PlanTableRow} from './PlanGalleryRenderers';

export type PlanGalleryProps = {
  ids?: Array<number>;
  tags?: string[];
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
  /** Tag-based galleries show ready-to-share maps only; opt in to
   * in-progress maps as well. */
  includeInProgress?: boolean;
} & PlanFlags;

export const PlanGallery: React.FC<PlanGalleryProps> = ({
  ids,
  tags,
  title,
  description,
  paginate,
  limit = 12,
  showListView = false,
  includeInProgress = false,
  ...flags
}: PlanGalleryProps) => {
  const isTagBased = Boolean(tags?.length && !ids?.length);
  const draftStatuses = includeInProgress ? SUBMITTED_STATUSES : [DRAFT_STATUSES.READY_TO_SHARE];
  // Mixed-status lists annotate each plan with its status; ready-only lists
  // are uniform, so a badge would be noise.
  const showStatus = isTagBased && includeInProgress;
  return (
    <Gallery<
      MinPublicDocument,
      {ids?: number[]; tags?: string[]; draftStatuses?: DraftStatus[]},
      MinPublicDocument[] | null
    >
      title={title}
      description={description}
      paginate={paginate}
      limit={limit}
      showListView={showListView}
      filters={{ids, tags, draftStatuses: isTagBased ? draftStatuses : undefined}}
      queryKey={['plans']}
      queryFunction={({filters, limit, offset}) =>
        getPlans({
          ids: filters.ids,
          tags: filters.tags,
          draftStatuses: filters.draftStatuses,
          limit,
          offset,
        }).then(result => (result?.ok ? result.response : null))
      }
      selectItems={data => (data || []) as MinPublicDocument[]}
      gridRenderer={(plan, i) => (
        <PlanCard key={i} plan={plan} {...flags} showStatus={showStatus} />
      )}
      tableHeader={
        <>
          <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
          {flags.showThumbnails && <Table.ColumnHeaderCell>Thumbnail</Table.ColumnHeaderCell>}
          {flags.showTitles && <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>}
          {flags.showModule && <Table.ColumnHeaderCell>Module</Table.ColumnHeaderCell>}
          {flags.showDescriptions && <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>}
          {flags.showTags && <Table.ColumnHeaderCell>Tags</Table.ColumnHeaderCell>}
          {flags.showUpdatedAt && <Table.ColumnHeaderCell>Updated At</Table.ColumnHeaderCell>}
          {showStatus && <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>}
        </>
      }
      tableRowRenderer={(plan, i) => (
        <PlanTableRow key={i} plan={plan} {...flags} showStatus={showStatus} />
      )}
    />
  );
};
