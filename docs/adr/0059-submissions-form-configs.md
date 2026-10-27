# 59. Submissions: per-portal form configs over field/value rows replace the comment tables

Date: 2026-09-25 (PR #746; legacy tables dropped #749; frontend #751; custom fields #752; recorded retrospectively 2026-09-28)

## Status

Accepted. Supersedes [0023](0023-comment-moderation.md), together with [0060](0060-submissions-public-on-arrival.md).

## Context

Public testimony was stored in fixed comment, commenter, and tag tables with a review state per row ([0023](0023-comment-moderation.md)). Every portal collected the same fields, and attaching a map meant pasting its link into a form. Partners running portals through the CMS ([0054](0054-wagtail-cms-service.md)) needed to choose which questions a portal asks; PR #746 "replaces the rigid comment/commenter/tag schema with a per-portal form builder."

## Decision

- **`comments.form_configs`** — one per portal: its chosen `fields`, `required_fields`, `admin_teams` ([0057](0057-roles-team-scoped-moderation.md)), `require_email_confirm`, and collection mode ([0061](0061-map-portal-ownership-collection-modes.md)). `portal_id` is the portal page's default-locale slug, resolved through the page's `translation_key` (PR #772), so a translation's stale slug cannot be claimed by another team. A portal accepts submissions only while its page is live (`form_configs.accepting`).
- **`comments.submissions`** — one per submission. The bigint `id` is the public handle. The `submission_id` UUID is the capability to finalize a draft and never appears in public reads. `status` is `draft` or `submitted`, a `VARCHAR` with a `CHECK` rather than a native enum. Moderation state is the `nsfw`, `hidden`, and `flagged` flags plus `moderation_match` ([0060](0060-submissions-public-on-arrival.md)).
- **`comments.submissions_content`** — sparse `(submission_id, field, value)` rows, one per answered field.
- **Fields come from a registry** (`backend/app/submissions/fields.py`); a portal picks from it and cannot invent new ones. The registry is mirrored in the CMS (`SUBMISSION_FIELD_CHOICES`) and the frontend (`Forms/fieldRegistry.tsx`), and a CMS test enforces that all three agree. `email` is private and never returned publicly. Portals may add `custom_`-prefixed text or textarea questions (`comments.form_fields_custom`, PR #752), whose answers are public.
- **Attached maps are cloned at submission** unless the portal's mode keeps a live reference (`map_is_clone`). The clone's edit UUID is never returned to anyone, so gallery entries are frozen, consistent with [0022](0022-share-model-public-ids.md).
- **Endpoints** (`backend/app/submissions/main.py`): create and finalize (both Turnstile-gated, [0050](0050-turnstile-captcha.md)), public list, form config, flag, and team-scoped admin routes.

PR #749 dropped the legacy comment tables, the review-status enum, and the slugify database functions (migration `d8f1b52c96e3`).

## Alternatives considered

- Converting legacy form comments into submissions. PR #749 proposed a converter; the shipped migration drops them instead: production held five, four of them test rows, so "a converter would mostly exist to carry test data forward while carrying its own edge cases."

## Consequences

Legacy form comments are gone; a `pg_dump` of the `comments` schema taken before the migration (cutover runbook step 1) is the only way to restore them, and rollback past the cutover is a database snapshot restore. The CMS content API keeps `tags` as an alias for one release so a frontend deployed before the cutover keeps working (the matching alias on `/api/documents/list` was removed in PR #779). Legacy portal pages keep their form blocks, which render nothing until an admin attaches a form config. Adding a field type means changing three registries in step.
