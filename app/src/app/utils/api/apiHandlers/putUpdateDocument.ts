import {AssignmentArray, AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {put} from '../factory';

export const putUpdateDocument = async ({
  assignments,
  document_id,
  last_updated_at,
  overwrite = false,
  metadata,
}: AssignmentsCreate) => {
  return await put<AssignmentsCreate, AssignmentsCreateResponse>('assignments')({
    body: {
      assignments,
      document_id,
      last_updated_at,
      overwrite,
      metadata: {
        color_scheme: metadata?.color_scheme ?? null,
        num_districts: metadata?.num_districts ?? null,
      }
    },
  });
};
