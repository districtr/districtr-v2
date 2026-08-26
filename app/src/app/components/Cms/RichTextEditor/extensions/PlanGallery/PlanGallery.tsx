'use client';
import React, {useState} from 'react';
import {Flex, SegmentedControl, Table, Text} from '@radix-ui/themes';
import {Gallery} from '@/app/components/Static/Gallery';
import {getPlans} from '@/app/utils/api/apiHandlers/getPlans';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {DRAFT_STATUSES, DRAFT_STATUS_TEXT, type DraftStatus} from '@constants/document/draftStatus';
import {PlanCard, PlanFlags, PlanTableRow} from './PlanGalleryRenderers';

export type PlanGalleryProps = {
  ids?: Array<number>;
  tags?: string[];
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
  showListView?: boolean;
  /** Show the viewer-facing completion-status control on tag-based galleries. */
  showStatusFilter?: boolean;
  /** Initial completion-status selection ('all' = in progress + ready to share). */
  defaultStatus?: 'all' | DraftStatus;
} & PlanFlags;

// Tagged galleries list maps that were "submitted" by moving past scratch.
const SUBMITTED_STATUSES: DraftStatus[] = [
  DRAFT_STATUSES.IN_PROGRESS,
  DRAFT_STATUSES.READY_TO_SHARE,
];

export const PlanGallery: React.FC<PlanGalleryProps> = ({
  ids,
  tags,
  title,
  description,
  paginate,
  limit = 12,
  showListView = false,
  showStatusFilter: showStatusFilterAttr = true,
  defaultStatus = 'all',
  ...flags
}: PlanGalleryProps) => {
  // Completion-status filter for tag-based galleries; 'all' means any
  // submitted map (in progress or ready to share).
  const [statusFilter, setStatusFilter] = useState<'all' | DraftStatus>(defaultStatus ?? 'all');
  const isTagBased = Boolean(tags?.length && !ids?.length);
  const showStatusFilter = isTagBased && showStatusFilterAttr;
  const draftStatuses = statusFilter === 'all' ? SUBMITTED_STATUSES : [statusFilter];
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
      header={
        showStatusFilter ? (
          <Flex direction="row" gap="2" align="center" pt="2">
            <Text size="2" color="gray">
              Status:
            </Text>
            <SegmentedControl.Root
              value={statusFilter}
              onValueChange={value => setStatusFilter(value as 'all' | DraftStatus)}
              size="1"
            >
              <SegmentedControl.Item value="all">All</SegmentedControl.Item>
              {SUBMITTED_STATUSES.map(status => (
                <SegmentedControl.Item key={status} value={status}>
                  {DRAFT_STATUS_TEXT[status]}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          </Flex>
        ) : undefined
      }
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
