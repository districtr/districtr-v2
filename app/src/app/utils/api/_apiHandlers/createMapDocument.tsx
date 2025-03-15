import axios from "axios";
import { DocumentObject } from "./types";

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} gerrydb_table - The gerrydb table.
 */
export interface DocumentCreate {
  gerrydb_table: string;
}

export const createMapDocument: (document: DocumentCreate) => Promise<DocumentObject> = async (
  document: DocumentCreate
) => {
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
      gerrydb_table: document.gerrydb_table,
    })
    .then(res => {
      return res.data;
    });
};