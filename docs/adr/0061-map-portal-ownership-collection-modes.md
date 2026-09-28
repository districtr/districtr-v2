# 61. A map belongs to at most one portal; each portal chooses a collection mode

Date: 2026-09-25 (PRs #748, #752, #753; single ownership #754, 2026-09-28; recorded retrospectively 2026-09-28)

## Status

Accepted

## Context

A user who drew a map for a portal had to copy its link into the portal's form. With submissions stored per portal ([0059](0059-submissions-form-configs.md)), PR #748 threaded the portal through map creation so that portal-started maps could join the gallery directly — "no more copy-a-link-into-a-form flow." Portals also differ in how much consent they need: a workshop may collect every map drawn, a public portal must ask first.

## Decision

**Ownership.** `document.portal_id` (migration `f3a9c1d27e58`; foreign key to `form_configs`, `ON UPDATE CASCADE`, `ON DELETE SET NULL`) records the one portal a map was created for. Creating a map from a portal page stamps it and opens a draft submission; if the portal has no form config, the map is created as an ordinary map. Other portals may still list a map by its id, but adding a map that another portal owns returns 409 with "Make a copy of it to add it here." The free-form submission tags are dropped, as the only other membership mechanism, which had already been ruled out for gallery visibility.

**Collection modes.** `form_configs.collection_mode` is one of `internal`, `auto_public`, `prompt` (the default), or `form` (`CHECK` in migration `e4a7c318b9d2`):

- `form` — the user submits the portal's form explicitly.
- `prompt` — the editor offers to join the gallery (`SubmitToPortalModal`) once the map is ready to share; the frontend re-checks the server's config, and pending drafts are kept in localStorage.
- `auto_public` and `internal` — no form. `auto_finalize_draft_submissions` flips the draft to submitted when the map reaches in-progress or ready-to-share, and back to draft if the author regresses the status, because the author never filled a consent form. The hook runs inside the metadata save of [0025](0025-save-sync-model.md). `internal` portals are left out of every public listing.

The CMS Portals hub (`cms/portals/`) is the admin's entry point per portal, and its wizard (`cms/content/portal_wizard.py`) creates the portal page, form config, and custom questions in one transaction.

## Alternatives considered

- Letting one map join any number of portals (PR #752). Reversed in PR #754 in favor of single ownership.
- Prompting at in-progress rather than ready-to-share. Rejected in PR #748: it "would 409 at finalize's ready-check."

## Consequences

Auto modes publish an author's live map with no form and withdraw it if they regress its status (PR #752). Clone-backed submissions stay one-way, since those were deliberate. The draft `submission_id` is a second capability secret next to the document UUID of [0022](0022-share-model-public-ids.md). Drafts that are never finalized accumulate; cleanup is tracked separately.
