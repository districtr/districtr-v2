/**
 * Client-side mirror of backend/app/models.py::sanitize_community_name.
 *
 * The backend sanitizes names on write (NFKC normalize, strip HTML tags, collapse
 * whitespace, drop control chars and Unicode format codepoints, 40-char cap). If the
 * UI only validates `length <= 40` against the raw input, a user can type
 * `<script>X</script>` (14 raw chars) that the backend strips to `X` (1 char) or even
 * to an empty string (rejected with 400). Run the same pipeline client-side so the
 * user sees the same value they're about to submit.
 */

export const MAX_COMMUNITY_NAME_LENGTH = 40;

const HTML_TAG_RE = /<[^>]+>/g;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;
const WHITESPACE_RE = /\s+/g;
// Unicode format category (Cf): bidi overrides, ZWJ/ZWSP, BOM, etc. See
// https://www.unicode.org/reports/tr44/#General_Category_Values
const FORMAT_CHAR_RE = /\p{Cf}/gu;

export function sanitizeCommunityName(name: string): string {
  const normalized = name.normalize('NFKC');
  const withoutTags = normalized.replace(HTML_TAG_RE, '');
  const collapsedWhitespace = withoutTags.replace(WHITESPACE_RE, ' ');
  const withoutControlChars = collapsedWhitespace.replace(CONTROL_CHAR_RE, '');
  const withoutFormatChars = withoutControlChars.replace(FORMAT_CHAR_RE, '');
  return withoutFormatChars.trim();
}

export interface CommunityNameValidation {
  /** Raw input after sanitization. */
  sanitized: string;
  /** True if sanitization changed the value (inform the user). */
  wasModified: boolean;
  /** True if post-sanitize length exceeds MAX_COMMUNITY_NAME_LENGTH. */
  tooLong: boolean;
  /** True if post-sanitize value is empty. */
  empty: boolean;
}

export function validateCommunityName(raw: string): CommunityNameValidation {
  const sanitized = sanitizeCommunityName(raw);
  return {
    sanitized,
    wasModified: sanitized !== raw,
    tooLong: sanitized.length > MAX_COMMUNITY_NAME_LENGTH,
    empty: sanitized.length === 0,
  };
}
