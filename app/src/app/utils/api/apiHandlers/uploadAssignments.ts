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
}: {
  assignments: [string, string][];
  districtr_map_slug: string;
}) => {
  return await post<
    {
      assignments: [string, string][];
      districtr_map_slug: string;
    },
    {document_id: string}
  >('create_document')({
    body: {
      assignments,
      districtr_map_slug,
    },
  });
};
