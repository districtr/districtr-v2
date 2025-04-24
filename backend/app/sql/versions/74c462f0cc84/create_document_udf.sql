DROP FUNCTION IF EXISTS create_document;
CREATE OR REPLACE FUNCTION create_document(districtr_map_slug text)
    RETURNS TABLE(document_id uuid, serial_id integer)
AS $$
DECLARE
  doc_id uuid;
  doc_id_text text;
  stmt text;
  serial_id_val integer;
BEGIN
  doc_id := gen_random_uuid();
  INSERT INTO document.document(document_id, districtr_map_slug) 
  VALUES (doc_id, districtr_map_slug)
  RETURNING document.document.serial_id INTO serial_id_val;
  
  stmt := create_assignment_partition_sql(CAST(doc_id AS text));
  EXECUTE stmt;
  
  RETURN QUERY SELECT doc_id AS document_id, serial_id_val AS serial_id;
END;
$$ LANGUAGE plpgsql;