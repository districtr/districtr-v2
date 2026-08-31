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


# Length caps for admin-defined custom questions, by field_type.
CUSTOM_FIELD_MAX_LENGTHS = {"text": 255, "textarea": 5000}


def validate_submission_fields(
    config_fields: list[str],
    required_fields: list[str],
    values: dict[str, str],
    custom_specs: list | None = None,
) -> list[str]:
    """Validate submitted field values against a form config.

    ``custom_specs`` are the portal's FormFieldCustom rows: their keys extend
    the allowed vocabulary, their `required` flags extend the required set,
    and their field_type sets the length cap.

    Returns ALL problems at once (the old comment form failed on the first
    error, which its own TODO called out as a bad interface).
    """
    errors: list[str] = []
    customs = {c.key: c for c in (custom_specs or [])}
    allowed = (set(config_fields) & set(FIELD_REGISTRY)) | set(customs)
    max_lengths = {
        **{name: cap for name, cap in FIELD_REGISTRY.items()},
        **{
            key: CUSTOM_FIELD_MAX_LENGTHS.get(c.field_type, 255)
            for key, c in customs.items()
        },
    }

    for name in values:
        if name not in allowed:
            errors.append(f"Unknown or disallowed field: {name}")

    all_required = list(required_fields) + [
        key for key, c in customs.items() if c.required
    ]
    for name in all_required:
        if not (values.get(name) or "").strip():
            errors.append(f"Missing required field: {name}")

    for name, value in values.items():
        if name not in allowed:
            continue
        if len(value) > max_lengths[name]:
            errors.append(f"Field {name} exceeds maximum length {max_lengths[name]}")
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
