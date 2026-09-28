# 58. District notes split from public testimony into their own table

Date: 2026-09-25 (PR #745; own package #754; recorded retrospectively 2026-09-28)

## Status

Accepted. Amends [0029](0029-district-comment-wholesale-sync.md).

## Context

Notes a map's author attaches to individual districts ([0029](0029-district-comment-wholesale-sync.md)) were stored as rows in the same comment, commenter, and tag tables as public testimony submitted through portal forms. The two have different owners, audiences, and moderation needs, and "that coupling is what made the comment tables impossible to replace" (PR #745) with the submission model of [0059](0059-submissions-form-configs.md).

## Decision

District notes move to `comments.district_notes` (migration `b3d9f47a25c1`): `document_id` with `ON DELETE CASCADE`, the district number (`zone`, `CHECK zone >= 0`), the note (up to 5,000 characters), `nsfw`, and `moderation_score`. The migration copied the legacy per-district rows and kept their ids, because community metadata references them. Saving still replaces a document's notes as a set: `sync_district_notes` (`backend/app/district_notes/services.py`) updates notes by id when the district matches, inserts new ones, deletes missing ones, and re-scores only changed text. Moderation is automatic only: a note scoring at or above the submissions threshold (0.2, [0060](0060-submissions-public-on-arrival.md)) is flagged `nsfw`, and public readers see "Comment removed due to moderation." in its place, while readers with edit access see the real text (`backend/app/core/dependencies.py`). Copying a map carries `nsfw` across (`duplicate_district_notes`), so a copy cannot launder a flagged note.

## Consequences

The replace-the-set semantics of [0029](0029-district-comment-wholesale-sync.md) survive, now per document and with stable row ids; its "without moderation" premise no longer holds. District notes are the one place where the "masked, not omitted" behavior of [0023](0023-comment-moderation.md) survives. No human review screen exists for notes, by design; `docs/WAGTAIL-CUTOVER-FOLLOWUPS.md` tracks it as open.
