import {post} from '../factory';
import {type MapType} from '@constants/document/types';

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
  map_type?: MapType;
}) => {
  return await post<
    {
      assignments: [string, string][];
      districtr_map_slug: string;
      map_type?: MapType;
    },
    {document_id: string; skipped_geo_ids: string[]}
  >('create_document')({
    body: {
      assignments,
      districtr_map_slug,
      map_type,
    },
  });
};
