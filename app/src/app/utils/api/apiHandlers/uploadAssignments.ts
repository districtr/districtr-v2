import {post} from '../factory';

/**
 *
 * @param assignmentTXT
 * @returns document_id if upload succeeds
 *
 * @param gerrydb_table_name
 * @param assignments
 */
export const uploadAssignments = async ({
  assignments,
  districtr_map_slug,
  strict_assignment_validation = true,
}: {
  assignments: [string, string][];
  districtr_map_slug: string;
  strict_assignment_validation?: boolean;
}) => {
  return await post<
    {
      assignments: [string, string][];
      districtr_map_slug: string;
      strict_assignment_validation?: boolean;
    },
    {
      document_id: string;
      inserted_assignments: number;
      import_summary?: {
        total_rows: number;
        inserted_assignments: number;
        null_zone_rows: number;
        invalid_zone_rows: number;
        invalid_geoid_rows: number;
        empty_geoid_rows: number;
      };
    }
  >('create_document')({
    body: {
      assignments,
      districtr_map_slug,
      strict_assignment_validation,
    },
  });
};
