CREATE OR REPLACE FUNCTION zone_assignments_geo(document_id UUID)
RETURNS TABLE (geo_id TEXT, zone TEXT, geometry GEOMETRY) AS $$
DECLARE
    sql_query TEXT;
BEGIN
    sql_query := format('SELECT * FROM "document.%s_geo"', document_id);
    RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
