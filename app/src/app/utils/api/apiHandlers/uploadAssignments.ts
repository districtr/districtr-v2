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
  gerrydb_table_name: string;
}) => Promise<{document_id: string}> = async ({assignments, gerrydb_table_name}) => {
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload_assignments`, {
      assignments,
      gerrydb_table_name,
    })
    .then(res => res.data);
};
