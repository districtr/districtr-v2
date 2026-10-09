# 62. Moderation is a deterministic word list, applied to portal submissions only

Date: 2026-09-30 (PR #776; recorded retrospectively 2026-10-09)

## Status

Accepted. Amends [0058](0058-district-notes-table.md) and [0060](0060-submissions-public-on-arrival.md).

## Context

Submissions and district notes were scored by OpenAI's moderation endpoint with a lexicon fallback ([0060](0060-submissions-public-on-arrival.md), [0058](0058-district-notes-table.md)). The score was opaque: a blurred entry could not be traced to a reason, identity terms and place or person names in testimony ("Coon Rapids", "Dick Durbin", "Wang") tripped it, and the call needed a network, an API key, and a background task, so an entry could be public before it had been checked (PR #776).

## Decision

- **A word list, not a model.** `backend/app/submissions/moderation.py` flags a submission when its text (every answer except `email`, plus the attached map's name and description) contains a blocklisted phrase of one to six words (`MAX_PHRASE_WORDS`), matched whole-word after lowercasing and stripping punctuation. `backend/app/submissions/blocklist.sha256` stores SHA-256 digests of the phrases, so the words themselves are not in the repo; `python -m app.submissions.moderation "<phrase>"` prints a phrase's line and whether it is listed. The list is curated from safetext's English list with identity terms, place and person names, and ordinary civic words removed. `openai`, `safetext`, the `OPENAI_API_KEY` setting, and the Pulumi secret are gone. Same text, same verdict, no network call.
- **The matched phrase replaces the score.** `submissions.moderation_match` stores the phrase that set `nsfw`, or NULL when the entry is clean (migration `f1c6a3d85b20`); the Portals hub shows it to portal admins, so a false positive can be traced to its list entry. It is in the admin payload only.
- **The check runs inside the request's transaction**, not as a background task: it takes about half a millisecond for a typical submission and 3 ms at the 1,000-word maximum, and cannot fail on the network, so an entry is never public before it has been checked.
- **District notes are not moderated.** They are the author's own annotations. The background task and the public "Comment removed due to moderation." placeholder are removed from the code, and migration `e4b8c1f07a92` drops the `nsfw` and `moderation_score` columns of `comments.district_notes`.
- **Flagged means blurred, never masked.** Card and table views both blur with an opt-in reveal (`NsfwShield`); portal admins see full text in the Portals hub and can blur, unblur, hide or restore.

## Consequences

Moderation needs no external service and gives the same verdict for the same text, so a verdict is reproducible from the list alone. The list is reviewed by probing phrases with the helper, not by reading a diff, because it is hashed. Existing nsfw verdicts on district notes were lost for good; those notes show verbatim to the public. Of [0060](0060-submissions-public-on-arrival.md), public-on-arrival, blur, and takedown stand; the scoring part is replaced. Of [0058](0058-district-notes-table.md), the table and the replace-the-set sync stand; the moderation part is removed, and the "without moderation" premise of [0029](0029-district-comment-wholesale-sync.md) holds again.
