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
  map_type,
}: {
  assignments: [string, string][];
  districtr_map_slug: string;
  map_type?: 'default' | 'local' | 'community';
}) => {
  return await post<
    {
      assignments: [string, string][];
      districtr_map_slug: string;
      map_type?: 'default' | 'local' | 'community';
    },
    {document_id: string}
  >('create_document')({
    body: {
      assignments,
      districtr_map_slug,
      map_type,
    },
  });
};
