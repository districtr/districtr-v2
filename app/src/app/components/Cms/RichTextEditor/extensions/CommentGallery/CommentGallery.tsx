'use client';
import React from 'react';
import {Gallery} from '@/app/components/Static/Gallery';
import {Table} from '@radix-ui/themes';
import {getPublicComments, type CommentFilters, type CommentListing} from '@/app/utils/api/apiHandlers/getComments';
import {CommentCard, CommentRow} from './CommentGalleryRenderers';

export interface CommentGalleryProps {
  _ids?: number[];
  _tags?: string[];
  _place?: string;
  _state?: string;
  _zipCode?: string;
  _offset?: number;
  _limit?: number;
  title?: string;
  description?: string;
}

export const CommentGallery: React.FC<CommentGalleryProps> = ({
  _ids,
  _tags,
  _place,
  _state,
  _zipCode,
  _offset,
  _limit,
  title,
  description,
}) => {
  const filters: CommentFilters = {
    ids: _ids,
    tags: _tags,
    place: _place,
    state: _state,
    zipCode: _zipCode,
    offset: _offset,
    limit: _limit,
  };

  return (
    <Gallery<CommentListing, CommentFilters, { ok: true; response: CommentListing[] } | { ok: false; error: { detail: string } }>
      title={title}
      description={description}
      paginate
      limit={_limit ?? 10}
      showListView
      filters={filters}
      queryKey={['comments']}
      queryFunction={({filters, limit, offset}) => getPublicComments({...filters, limit, offset})}
      selectItems={data => (data && 'ok' in data && data.ok ? data.response : [])}
      isError={data => Boolean(data && 'ok' in data && !data.ok)}
      errorMessage={data => (data && 'ok' in data && !data.ok ? data.error.detail : null)}
      gridRenderer={(comment, i) => <CommentCard key={i} comment={comment} />}
      tableHeader={
        <>
          <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Place</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>State</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Zip</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
        </>
      }
      tableRowRenderer={(comment, i) => <CommentRow key={i} comment={comment} />}
    />
  );
};
