CREATE OR REPLACE FUNCTION normalize_email()
RETURNS trigger AS $$
BEGIN
    NEW.email = TRIM(LOWER(NEW.email));
    RETURN NEW;
END;
$$ language 'plpgsql';
