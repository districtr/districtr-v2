# 22. Share model: the document UUID is the edit capability; public ids for everything else

Date: 2025-08-06 (PR #415; chain #234 → #393 → #415; routing hardened #636; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Save/share began with frozen share tokens and a checkout/locking system (PR #234, 2025-03-21). PR #393 (2025-06-09) started protecting the document id from frozen clients — accepting a token as a stand-in on reads and never echoing the UUID back. The token machinery was complexity on top of what the UUID already provided.

## Decision

The document UUID itself is the edit capability: possession grants edit rights, so it is treated as a secret. A sequential `public_id` (PR #415) serves every non-edit surface: `map/{public_id}` for read-only public maps, `map/edit/{document_id}` for editing, `map/{public_id}?pw=true` for password-gated share links (unlocking redirects to the edit id). The UUID is never leaked to frozen clients and, since PR #636 reworked routing, never shown in user-facing routes at all; the URL-visible "edit link" (`private_edit_id`) is a reversible base64url shortening of the UUID, not a separate credential.

## Consequences

Access control is capability-possession plus the `get_document`/`get_protected_document` dependency split — no per-share token table to manage. Anything that prints, logs, or serializes a document UUID is a security decision. Thumbnails generate from the edit id but publish under the public id (PR #415).
