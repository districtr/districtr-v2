import {AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {put} from '../factory';
import {MAP_TYPES} from '@constants/document/types';

export const putUpdateDocument = async ({
  assignments,
  document_id,
  last_updated_at,
  overwrite = false,
  map_type,
  metadata,
  comments,
}: AssignmentsCreate) => {
  return await put<AssignmentsCreate, AssignmentsCreateResponse>('assignments')({
    body: {
      assignments,
      document_id,
      last_updated_at,
      overwrite,
      map_type: map_type ?? MAP_TYPES.DEFAULT,
      metadata: {
        color_scheme: metadata?.color_scheme ?? null,
        num_districts: metadata?.num_districts ?? null,
        num_communities: metadata?.num_communities ?? null,
        community_metadata_list: metadata?.community_metadata_list ?? null,
      },
      comments: comments ?? null,
    },
  });
};
