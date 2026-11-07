import {AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {putMsgpack} from '../msgpack';
import {MAP_TYPES} from '@constants/document/types';

export const putUpdateDocument = async ({
  assignments,
  assignments_delta,
  document_id,
  last_updated_at,
  overwrite = false,
  map_type,
  metadata,
  comments,
}: AssignmentsCreate) => {
  return await putMsgpack<AssignmentsCreate, AssignmentsCreateResponse>('assignments', {
    // Only the key in use: a server without delta support then rejects a delta
    // rather than reading a missing plan as an empty one.
    ...(assignments_delta ? {assignments_delta} : {assignments}),
    document_id,
    last_updated_at,
    overwrite,
    map_type: map_type ?? MAP_TYPES.DEFAULT,
    metadata: {
      color_scheme: metadata?.color_scheme ?? null,
      num_districts: metadata?.num_districts ?? null,
      num_communities: metadata?.num_communities ?? null,
      community_metadata_list: metadata?.community_metadata_list ?? null,
      zone_aliases: metadata?.zone_aliases ?? null,
      zone_order: metadata?.zone_order ?? null,
    },
    comments: comments ?? null,
  });
};
