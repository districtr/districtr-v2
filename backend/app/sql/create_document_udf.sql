CREATE OR REPLACE FUNCTION create_document(gerrydb_table_name text)
    RETURNS uuid
AS $$
DECLARE
  doc_id uuid;
  doc_id_text text;
  stmt text;
BEGIN
  doc_id := gen_random_uuid();
  INSERT INTO document.document( document_id, gerrydb_table ) VALUES ( doc_id, gerrydb_table_name );
  stmt := create_assignment_partition_sql(CAST(doc_id AS text));
  EXECUTE stmt;
  RETURN doc_id;
END;
$$ LANGUAGE plpgsql;
