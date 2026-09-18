# 23. Comment moderation: OpenAI moderation API with local-lexicon fallback

Date: 2025-09-02 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The public comments module (PR #431) let anyone submit comments, commenters, and tags under the project's banner without review, creating a risk of abusive submissions going live unmoderated (PR #433).

## Decision

Moderate comments, commenters, and tags using OpenAI's moderation API, with a fallback to a local lexicon-based package (safetext) if the API call fails. Store moderation scores and review state on each row rather than a separate moderation table. Rejected content is masked, not omitted, and a background task runs moderation on submission with a review endpoint to override the machine-assigned score.

## Alternatives considered

- Dedicated moderation tables per submission type (comment, commenter, tag). Not pursued — moderation scores are added directly to each existing table instead.

## Consequences

Submissions are scored automatically at write time via a background task, with a human-reviewable override endpoint for correcting machine misclassification. Availability of moderation degrades gracefully to a local lexicon check if OpenAI's API is unreachable, rather than blocking submission.
