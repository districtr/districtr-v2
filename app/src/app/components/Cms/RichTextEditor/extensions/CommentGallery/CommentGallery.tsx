'use client';
import React from 'react';
import {Gallery} from '@/app/components/Static/Gallery';
import {Table} from '@radix-ui/themes';
import {
  getPublicComments,
  type CommentFilters,
  type CommentListing,
} from '@/app/utils/api/apiHandlers/getComments';
import {CommentCard, CommentRow} from './CommentGalleryRenderers';

export interface CommentGalleryProps {
  ids?: number[];
  tags?: string[];
  place?: string;
  state?: string;
  zipCode?: string;
  offset?: number;
  limit?: number;
  title?: string;
  description?: string;
  paginate?: boolean;
  showListView?: boolean;
  showTitles?: boolean;
  showPlaces?: boolean;
  showStates?: boolean;
  showZipCodes?: boolean;
  showCreatedAt?: boolean;
  showIdentitifier?: boolean;
}

export const CommentGallery: React.FC<CommentGalleryProps> = ({
  ids,
  tags,
  place,
  state,
  zipCode,
  offset,
  limit,
  title,
  description,
  showListView,
  showTitles,
  showPlaces,
  showStates,
  showZipCodes,
  showCreatedAt,
  showIdentitifier,
}) => {
  const filters: CommentFilters = {
    ids: ids,
    tags: tags,
    place: place,
    state: state,
    zipCode: zipCode,
    offset: offset,
    limit: limit,
  };

  return (
    <Gallery<
      CommentListing,
      CommentFilters,
      {ok: true; response: CommentListing[]} | {ok: false; error: {detail: string}}
    >
      title={title}
      description={description}
      paginate
      limit={limit ?? 10}
      showListView={showListView}
      filters={filters}
      queryKey={['comments']}
      queryFunction={({filters, limit, offset}) => getPublicComments({...filters, limit, offset})}
      selectItems={data => (data?.ok ? data.response : [])}
      isError={data => !Boolean(data?.ok)}
      errorMessage={data => (data?.ok ? null : data?.error?.detail)}
      gridRenderer={(comment, i) => (
        <CommentCard
          key={i}
          comment={comment}
          options={{
            showIdentitifier,
            showTitles,
            showPlaces,
            showStates,
            showZipCodes,
            showCreatedAt,
          }}
        />
      )}
      tableHeader={
        <>
          {showTitles && <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>}
          {showIdentitifier && <Table.ColumnHeaderCell>Identifier</Table.ColumnHeaderCell>}
          {showPlaces && <Table.ColumnHeaderCell>Place</Table.ColumnHeaderCell>}
          {showStates && <Table.ColumnHeaderCell>State</Table.ColumnHeaderCell>}
          {showZipCodes && <Table.ColumnHeaderCell>Zip</Table.ColumnHeaderCell>}
          {showCreatedAt && <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>}
        </>
      }
      tableRowRenderer={(comment, i) => (
        <CommentRow
          key={i}
          comment={comment}
          options={{
            showIdentitifier,
            showTitles,
            showPlaces,
            showStates,
            showZipCodes,
            showCreatedAt,
          }}
        />
      )}
    />
  );
};
