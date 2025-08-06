CREATE OR REPLACE FUNCTION slugify_tag(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    IF input_text IS NULL OR TRIM(input_text) = '' THEN
        RETURN NULL;
    END IF;

    RETURN LOWER(
        TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(input_text, '[^a-zA-Z0-9\s-]', '', 'g'),  -- Remove special chars
                '[[:space:]]+', '-', 'g'  -- Replace spaces with dashes
            ),
            '-'  -- Trim any leading/trailing dashes
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
