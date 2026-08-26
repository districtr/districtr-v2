import {MinPublicDocument} from './types';
import {get} from '../factory';
import type {DraftStatus} from '@constants/document/draftStatus';

export const getPlans = async ({
  ids,
  tags,
  draftStatuses,
  limit,
  offset,
}: {
  ids?: number[];
  tags?: string[];
  draftStatuses?: DraftStatus[];
  limit?: number;
  offset?: number;
}) => {
  const queryParams: Record<string, string | number | (string | number)[]> = {};

  if (ids) {
    queryParams.ids = ids;
  } else if (tags) {
    queryParams.tags = tags;
  }

  if (draftStatuses?.length) {
    queryParams.draft_status = draftStatuses;
  }

  if (limit !== undefined) {
    queryParams.limit = limit;
  }

  if (offset !== undefined) {
    queryParams.offset = offset;
  }

  return await get<MinPublicDocument[]>('documents/list')({
    queryParams,
  });
};
