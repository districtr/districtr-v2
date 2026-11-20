CREATE OR REPLACE FUNCTION create_document(districtr_map_slug text)
    RETURNS uuid
AS $$
DECLARE
  doc_id uuid;
  doc_id_text text;
  stmt text;
BEGIN
  doc_id := gen_random_uuid();
  INSERT INTO document.document( document_id, districtr_map_slug ) VALUES ( doc_id, districtr_map_slug );
  stmt := create_assignment_partition_sql(CAST(doc_id AS text));
  EXECUTE stmt;
  RETURN doc_id;
END;
$$ LANGUAGE plpgsql;
