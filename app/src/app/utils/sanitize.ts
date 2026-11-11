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
// Spelled out rather than \s, whose set differs between JS and Python: this is
// Python's str.isspace() set (JS's \s adds U+FEFF and lacks U+001C-U+001F and
// U+0085). The backend uses the same class.
const WHITESPACE_RE =
  /[\t\n\v\f\r \x1c-\x1f\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;
// Unicode format category (Cf): bidi overrides, ZWJ/ZWSP, BOM, etc. See
// https://www.unicode.org/reports/tr44/#General_Category_Values
const FORMAT_CHAR_RE = /\p{Cf}/gu;

export function sanitizeCommunityName(name: string): string {
  const normalized = name.normalize('NFKC');
  const withoutTags = normalized.replace(HTML_TAG_RE, '');
  const collapsedWhitespace = withoutTags.replace(WHITESPACE_RE, ' ');
  const withoutControlChars = collapsedWhitespace.replace(CONTROL_CHAR_RE, '');
  const withoutFormatChars = withoutControlChars.replace(FORMAT_CHAR_RE, '');
  // Again after the removals, so cleaning a clean name changes nothing: a
  // dropped zero-width space can leave two spaces side by side, and a dropped
  // tag can leave a letter and its accent to compose.
  const collapsedAgain = withoutFormatChars.replace(WHITESPACE_RE, ' ');
  return collapsedAgain.normalize('NFKC').trim();
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
