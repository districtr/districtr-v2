"""The submission field registry.

form_configs.fields is a subset of this fixed vocabulary — a portal picks
which fields its form shows, it cannot invent new ones. The registry is the
contract shared with the CMS form-config editor and the frontend renderer
(app/src/app/components/Forms/fieldRegistry.tsx): adding a field means
touching all three, exactly like the CMS block contract in
cms/content/blocks.py.

PRIVATE_FIELDS are stored but never returned by the public list endpoint.
"""

import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ZIP_RE = re.compile(r"^\d{5}(-\d{4})?$")

# field name -> max length. Validation beyond length is per-field below.
FIELD_REGISTRY: dict[str, int] = {
    "salutation": 255,
    "first_name": 255,
    "last_name": 255,
    "email": 320,  # RFC 5321 limit
    "title": 255,
    "comment": 5000,
    "place": 255,
    "state": 255,
    "zip_code": 255,
}

PRIVATE_FIELDS = frozenset({"email"})


def validate_submission_fields(
    config_fields: list[str],
    required_fields: list[str],
    values: dict[str, str],
) -> list[str]:
    """Validate submitted field values against a form config.

    Returns ALL problems at once (the old comment form failed on the first
    error, which its own TODO called out as a bad interface).
    """
    errors: list[str] = []
    allowed = set(config_fields) & set(FIELD_REGISTRY)

    for name in values:
        if name not in allowed:
            errors.append(f"Unknown or disallowed field: {name}")

    for name in required_fields:
        if not (values.get(name) or "").strip():
            errors.append(f"Missing required field: {name}")

    for name, value in values.items():
        if name not in allowed:
            continue
        if len(value) > FIELD_REGISTRY[name]:
            errors.append(f"Field {name} exceeds maximum length {FIELD_REGISTRY[name]}")
        stripped = value.strip()
        if not stripped:
            continue  # empty optional values are simply not stored
        if name == "email" and not EMAIL_RE.match(stripped):
            errors.append("Invalid email address")
        if name == "zip_code" and not ZIP_RE.match(stripped):
            errors.append("Invalid zip code")

    return errors


def slugify(value: str) -> str:
    """Lowercase, trim, collapse non-alphanumerics to single hyphens.

    Replaces the slugify_tag SQL UDF the legacy tag table used.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug
