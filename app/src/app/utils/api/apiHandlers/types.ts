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
  district_comments: Record<number, string> | null;
  location_comments: Array<{
    lat: number;
    lng: number;
    comment: string;
  }> | null;
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
