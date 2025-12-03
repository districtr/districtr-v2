import {MinPublicDocument} from './types';
import {get} from '../factory';

export const getPlans = async ({
  ids,
  tags,
  limit,
  offset,
}: {
  ids?: number[];
  tags?: string[];
  limit?: number;
  offset?: number;
}) => {
  const queryParams: Record<string, string | number | (string | number)[]> = {};

  if (ids) {
    queryParams.ids = ids;
  } else if (tags) {
    queryParams.tags = tags;
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
