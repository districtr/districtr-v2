import {AssignmentArray, AssignmentsCreate, AssignmentsCreateResponse} from './types';
import {put} from '../factory';

export const putUpdateAssignments = async ({
  assignments,
  document_id,
  last_updated_at,
  overwrite = false,
  color_scheme,
  num_districts,
}: {
  assignments: AssignmentArray[];
  document_id: string;
  last_updated_at: string;
  overwrite?: boolean;
  color_scheme?: string[] | null;
  num_districts?: number | null;
}) => {
  return await put<AssignmentsCreate, AssignmentsCreateResponse>('assignments')({
    body: {
      assignments,
      document_id,
      last_updated_at,
      overwrite,
      color_scheme: color_scheme ?? null,
      num_districts: num_districts ?? null,
    },
  });
};
