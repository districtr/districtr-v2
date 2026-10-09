# 58. District notes split from public testimony into their own table

Date: 2026-09-25 (PR #745; own package #754; recorded retrospectively 2026-09-28)

## Status

Accepted. Amends [0029](0029-district-comment-wholesale-sync.md). Amended by [0062](0062-deterministic-moderation-submissions-only.md).

## Context

Notes a map's author attaches to individual districts ([0029](0029-district-comment-wholesale-sync.md)) were stored as rows in the same comment, commenter, and tag tables as public testimony submitted through portal forms. The two have different owners, audiences, and moderation needs, and "that coupling is what made the comment tables impossible to replace" (PR #745) with the submission model of [0059](0059-submissions-form-configs.md).

## Decision

District notes move to `comments.district_notes` (migration `b3d9f47a25c1`): `document_id` with `ON DELETE CASCADE`, the district number (`zone`, `CHECK zone >= 0`), the note (up to 5,000 characters), and, until PR #776 dropped them, `nsfw` and `moderation_score`. The migration copied the legacy per-district rows and kept their ids, because community metadata references them. Saving still replaces a document's notes as a set: `sync_district_notes` (`backend/app/district_notes/services.py`) updates notes by id when the district matches, inserts new ones, and deletes missing ones. At PR #745 moderation was automatic only: a note scoring at or above the submissions threshold (0.2, [0060](0060-submissions-public-on-arrival.md)) was flagged `nsfw`, public readers saw "Comment removed due to moderation." in its place, and copying a map carried `nsfw` across. [0062](0062-deterministic-moderation-submissions-only.md) removed all of that on 2026-09-30: notes are the author's own annotations and are not moderated.

## Consequences

The replace-the-set semantics of [0029](0029-district-comment-wholesale-sync.md) survive, now per document and with stable row ids. Its "without moderation" premise was broken by this record and restored by [0062](0062-deterministic-moderation-submissions-only.md); no review screen for notes exists, because nothing flags them.
