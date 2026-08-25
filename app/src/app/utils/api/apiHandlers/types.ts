import {type NullableZone} from '@constants/map/zone';
import {type MapType} from '@constants/document/types';
import type {DraftStatus} from '@constants/document/draftStatus';
import {type AccessState} from '@constants/document/state';
import {type GeoUnit} from '@constants/document/geoUnits';

export interface Assignment {
  document_id: string;
  geo_id: string;
  zone: NullableZone;
  parent_path?: string | null;
}

export type AssignmentArray = [string, NullableZone];

export interface DocumentCommentCreate {
  comment_id?: string | number | null;
  zone?: number | null;
  text: string;
}

export interface AssignmentsCreate {
  assignments: AssignmentArray[];
  document_id: string;
  last_updated_at: string;
  overwrite: boolean;
  map_type?: MapType;
  metadata?: {
    color_scheme?: string[] | null;
    num_districts?: number | null;
    num_communities?: number | null;
    community_metadata_list?: Community[] | null;
  };
  comments?: DocumentCommentCreate[] | null;
}
export interface AssignmentsCreateResponse {
  assignments_inserted: number;
  updated_at: string;
}

export interface AssignmentsReset {
  success: boolean;
  document_id: string;
}

export interface DistrictrMap {
  name: string;
  districtr_map_slug: string;
  gerrydb_table_name: string;
  parent_layer: string;
  child_layer: string | null;
  tiles_s3_path: string | null;
  num_districts: number | null;
  map_type: MapType;
}

export interface StatusObject {
  access: AccessState;
  genesis: 'shared' | 'copied' | 'created';
  token?: string | null;
  password?: string | null;
}

export interface DocumentMetadata {
  name: string | null;
  group: string | null;
  tags: string[] | null;
  description: string | null;
  eventId: string | null;
  draft_status: DraftStatus | null;
}

export interface Community {
  id: number;
  render_order_id: number;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  descriptionCommentId?: string | null;
}

export interface DocumentObject extends StatusObject {
  document_id: string;
  public_id: number | null;
  /** Draft-submission finalize capability, present when the document was
   * created with a portal_id (map-from-portal pathway). */
  submission_id?: string | null;
  /** True when the map has an edit password; lets read-only viewers unlock draw mode. */
  password_required?: boolean;
  districtr_map_slug: string;
  gerrydb_table: string;
  parent_layer: string;
  child_layer: string | null;
  tiles_s3_path: string | null;
  num_districts: number | null;
  /** COI-only local metadata for community count. */
  num_communities?: number | null;
  /** COI-only local metadata for explicit community ordering/color state. */
  community_metadata_list?: Community[] | null;
  /** If false, users cannot change the number of districts on the frontend. */
  num_districts_modifiable?: boolean;
  map_module: string;
  created_at: string;
  updated_at: string;
  extent: [number, number, number, number]; // [minx, miny, maxx, maxy]
  map_metadata: DocumentMetadata;
  color_scheme: string[] | null;
  map_type: MapType;
  comment: string | null;
  parent_geo_unit_type: GeoUnit;
  child_geo_unit_type: GeoUnit | null;
  data_source_name: string;
  overlays: Overlay[] | null;
  statefps: string[];
  document_comments?: DocumentComment[] | null;
  community_name_length_limit?: number;
  comment_length_limit: number;
  comment_count_limit: number;
}

export interface DocumentComment {
  comment_id?: string; // undefined for local-only comments
  zone?: number | null;
  text: string;
  moderated?: boolean; // true when comment failed moderation; edit access sees full text
  created_at?: string;
  updated_at?: string;
}

export interface MinPublicDocument {
  public_id: number;
  map_metadata: DocumentMetadata;
  document_type: 'district' | 'coi';
  map_module: string;
  updated_at: string;
}

export interface DocumentCreate {
  districtr_map_slug: string;
  map_type?: MapType;
  metadata?: DocumentMetadata;
  copy_from_doc?: string | number;
  /** Portal slug: creates a draft submission alongside the document
   * (the map-from-portal auto-submit pathway). */
  portal_id?: string | null;
}

export type ShatterResult = Array<{
  child_path: string;
  parent_path: string;
}>;

export interface ColorsSet {
  success: boolean;
  document_id: string;
}

export type RemoteAssignmentsResponse = {
  type: 'remote';
  documentId: string;
  assignments: Assignment[];
};

export type LocalAssignmentsResponse = {
  type: 'local';
  documentId: string;
  assignments: Assignment[];
};

export type MapGroup = {
  name: string;
  slug: string;
};

export interface Overlay {
  overlay_id: string;
  name: string;
  description: string | null;
  data_type: 'geojson' | 'pmtiles';
  layer_type: 'fill' | 'line' | 'text';
  custom_style: Record<string, any> | null;
  source: string | null;
  source_layer: string | null;
  id_property: string | null;
}
