import {MinPublicDocument} from './types';
import {get} from '../factory';

/** A gallery lists either a curated set of ids (the API caps it at 50) or one
 * portal's submissions at one status. There is no unfiltered listing. */
export type PlanQuery =
  | {ids: number[]}
  | {portalId: string; draftStatus: 'ready_to_share' | 'in_progress'};

export const getPlans = async (query: PlanQuery & {limit?: number; offset?: number}) => {
  const queryParams: Record<string, string | number | (string | number)[]> =
    'ids' in query
      ? {ids: query.ids}
      : {portal_id: query.portalId, draft_status: query.draftStatus};
  if (query.limit !== undefined) queryParams.limit = query.limit;
  if (query.offset !== undefined) queryParams.offset = query.offset;
  return await get<MinPublicDocument[]>('documents/list')({queryParams});
};
