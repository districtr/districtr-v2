import axios from 'axios';

/**
 *
 * @param assignmentTXT
 * @returns document_id if upload succeeds
 *
 * @param gerrydb_table_name
 * @param assignments
 */
export const uploadAssignments: (updateData: {
  assignments: [string, string][];
  districtr_map_slug: string;
  user_id: string | null;
}) => Promise<{document_id: string}> = async ({assignments, districtr_map_slug, user_id}) => {
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
      assignments,
      districtr_map_slug,
      user_id,
    })
    .then(res => res.data);
};
