import {SummaryStatConfig} from '../summaryStats';

export interface Assignment {
  document_id: string;
  geo_id: string;
  zone: number;
  parent_path?: string;
}

export interface AssignmentsCreate {
  assignments_upserted: number;
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
}

export interface StatusObject {
  status: 'locked' | 'unlocked' | 'checked_out';
  access: 'read' | 'edit';
  genesis: 'shared' | 'copied' | 'created';
  token?: string | null;
  password?: string | null;
}

export type DraftStatus = 'scratch' | 'in_progress' | 'ready_to_share';

export interface DocumentMetadata {
  name: string | null;
  group: string | null;
  tags: string | null;
  description: string | null;
  eventId: string | null;
  draft_status: DraftStatus | null;
}

export interface DocumentObject extends StatusObject {
  document_id: string;
  public_id: number | null;
  districtr_map_slug: string;
  gerrydb_table: string;
  parent_layer: string;
  child_layer: string | null;
  tiles_s3_path: string | null;
  num_districts: number | null;
  map_module: string | null;
  created_at: string;
  updated_at: string | null;
  extent: [number, number, number, number]; // [minx, miny, maxx, maxy]
  map_metadata: DocumentMetadata;
  color_scheme: string[] | null;
  map_type: 'default' | 'local';
  comment: string | null;
  parent_geo_unit_type: string | null;
  child_geo_unit_type: string | null;
  data_source_name: string | null;
}

export interface MinPublicDocument {
  public_id: number;
  map_metadata: DocumentMetadata;
  map_module: string;
  updated_at: string;
}

export interface DocumentCreate {
  districtr_map_slug: string;
  user_id: string | null;
  metadata?: DocumentMetadata;
  copy_from_doc?: string | number;
}

export interface ZonePopulation {
  zone: number;
  total_pop_20: number;
}

export interface ShatterResult {
  parents: {geoids: string[]};
  children: Assignment[];
}

export interface ColorsSet {
  success: boolean;
  document_id: string;
}

export type RemoteAssignmentsResponse = {
  type: 'remote';
  documentId: string;
  assignments: Assignment[];
};

export type GetAssignmentsResponse = Promise<RemoteAssignmentsResponse | null>;

export type MapGroup = {
  name: string;
  slug: string;
};

export interface CommentCreate {
  title: string;
  comment: string;
  commenter_id: number | null;
  document_id: string | null;
}

export interface CommentPublic {
  created_at: string | null;
  updated_at: string | null;
}

export interface CommenterCreate {
  first_name: string;
  email: string;
  salutation: string | null;
  last_name: string | null;
  place: string | null;
  state: string | null;
  zip_code: string | null;
}

export interface CommenterPublic {
  created_at: string | null;
  updated_at: string | null;
}

export interface TagPublic {
  slug: string;
}

export interface TagCreate {
  tag: string;
}

export interface FullCommentForm {
  comment: CommentCreate;
  commenter: CommenterCreate;
  tags: TagCreate[];
  recaptcha_token: string;
}

export interface FullCommentFormResponse {
  comment: CommentPublic;
  commenter: CommenterPublic;
  tags: TagPublic[];
}
