import { SummaryTypes } from "../summaryStats";

export interface DocumentObject {
  document_id: string;
  gerrydb_table: string;
  parent_layer: string;
  child_layer: string | null;
  tiles_s3_path: string | null;
  num_districts: number | null;
  created_at: string;
  updated_at: string | null;
  extent: [number, number, number, number]; // [minx, miny, maxx, maxy]
  available_summary_stats: Array<SummaryTypes>;
  color_scheme: string[] | null;
}

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} gerrydb_table - The gerrydb table.
 */
export interface DocumentCreate {
  gerrydb_table: string;
}