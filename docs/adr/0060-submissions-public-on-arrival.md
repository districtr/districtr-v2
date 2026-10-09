# 60. Submissions are public on arrival; moderation is an automatic check plus admin takedown

Date: 2026-09-25 (PRs #746, #747; review UI retired #753; recorded retrospectively 2026-09-28)

## Status

Accepted. Supersedes [0023](0023-comment-moderation.md), together with [0059](0059-submissions-form-configs.md). Amended by [0062](0062-deterministic-moderation-submissions-only.md).

## Context

Comments carried a review state and a human override endpoint, and rejected content was masked in public responses rather than omitted ([0023](0023-comment-moderation.md)). The review queue made every portal's testimony wait on an admin. PR #753 made the product decision that "everything is public on arrival; admin power is takedown (hide/blur), not approval."

## Decision

A submission is public as soon as it is submitted; there is no approval gate. Moderation has three parts:

- **Automatic scoring** (at PRs #746 and #747; replaced by the word-list check of [0062](0062-deterministic-moderation-submissions-only.md) on 2026-09-30). A background task after create, finalize, and auto-finalize scored all answer values plus the attached map's name and description with OpenAI's `omni-moderation-latest`, falling back to the safetext lexicon, and scoring 1.0 if both failed (`backend/app/submissions/moderation.py`). A score of 0.2 or more set `nsfw`. Maps an admin adds directly are not checked.
- **Blur, not redaction.** `nsfw` rows are served in full with the flag set, and the frontend blurs them behind a reveal button (`Shared/NsfwShield.tsx`).
- **Takedown.** Portal admins ([0057](0057-roles-team-scoped-moderation.md)) can set or clear `nsfw` and set `hidden` from the CMS Portals hub. `hidden` rows are left out of every public list, and hiding a cloned map also demotes the clone's draft status. Visitors can report a submission (`POST /api/submissions/flag`, session-gated), which sets `flagged` for admin attention; either admin action clears it.

Page publishing is unaffected: pages still go through Wagtail's approval workflow ([0054](0054-wagtail-cms-service.md)). Only submissions are review-free.

## Consequences

Nothing is approved before it goes public, so abusive testimony is visible (blurred, if flagged) until an admin takes it down. Of [0023](0023-comment-moderation.md), per-row review state, the review override endpoint, and public masking are gone; its OpenAI scoring survived here until [0062](0062-deterministic-moderation-submissions-only.md) replaced it with a word list and the matched phrase. Takedown never demotes an author's live map (`map_is_clone = false`).
