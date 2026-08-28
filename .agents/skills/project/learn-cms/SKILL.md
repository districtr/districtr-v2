---
name: learn-cms
description: Editorial content flows — CMS page authoring and review, custom TipTap editor nodes, and comment moderation/review states. Use when editing CMS content or its admin UI, adding or changing a TipTap node, or touching moderation thresholds or review-state visibility for comments.
user-invocable: false
---

# CMS & Moderation

## Invariants

- **Draft and published content are two columns, not a status flag.** Every CMS content
  row (`TagsCMSContent`, `PlacesCMSContent`, `backend/app/cms/models.py`) carries
  `draft_content` and `published_content` as separate JSONB columns. Publishing
  (`POST /content/publish`, `backend/app/cms/main.py`) moves `draft_content` into
  `published_content` and clears `draft_content` — it does not flip an enum. A public
  read serves `published_content`; the admin/editor view serves `draft_content` when
  present. There is no "in review" state stored on content itself — review status
  belongs to comments (below), not CMS pages.
- **A TipTap node ships in one place, both directions.** Every custom node (Boilerplate,
  CommentGallery, CommentSubmissionForm, HeaderSecondTierNav, MapCreateButtons — under
  `app/src/app/components/Cms/RichTextEditor/extensions/`) defines both `parseHTML`
  (reading stored content back into the editor) and `renderHTML` (writing editor state
  back to storable HTML/JSON), plus a `NodeView` for interactive editor rendering. A node
  edited in only one direction round-trips content that either can't be re-opened in the
  editor or doesn't render on the public page.
- **`ReviewStatus` values (`REVIEWED`, `APPROVED`, `REJECTED`,
  `backend/app/comments/models.py`) gate what a public reader sees, not what exists in
  the table.** A rejected or over-threshold comment stays in the database; public
  responses substitute a placeholder string
  (`"Comment removed due to moderation."`, `get_document_public` in `dependencies.py`)
  rather than omitting the row, so zone-scoped comment counts stay accurate for admins
  even when the text itself is hidden from the public.

## Content authoring and publishing

`app/src/app/admin/cms/[type]/CmsPage.tsx` and `app/src/app/components/Cms/ContentEditor/`
drive CMS CRUD through the same TipTap-based `RichTextEditor`
(`app/src/app/components/Cms/RichTextEditor/RichTextEditor.tsx`) used for both tags-pages
and places-pages content — the `type` route segment selects which backend model
(`TagsCMSContent` vs `PlacesCMSContent`) a given page's content resolves to, but the
editing surface and node set are shared. Scope enforcement follows `learn-auth-share`'s
`TokenScope` values (`create_content`, `update_content`, `publish_content`, etc.) — the
publish endpoint specifically requires `publish_content`, distinct from the
`update_content` scope that gates saving a draft, so a role can be granted draft-editing
without publish authority.

### Adding a TipTap node — worked example (`BoilerplateNode`)

`BoilerplateNode.tsx` is the minimal instance of the pattern every custom node follows:

- `addAttributes` declares the node's data (`customContent`), with `parseHTML`/
  `renderHTML` functions from `extensionUtils` that serialize it as a JSON-in-HTML-attribute
  round-trip.
- `parseHTML`/`renderHTML` at the node level (not just per-attribute) define how the node
  itself maps to a DOM tag (`div[data-node-type="boilerplateNode"]`) — this is what lets
  content saved from the editor be read back into it later, and what the public-page
  render pass (`RichTextRenderer`, via its `domNodeReplacers`) matches against without
  needing the editor loaded. (The in-code comments on these node files say "RichTextView"
  — no such component exists; `RichTextRenderer` is the actual name, confirmed 2026-08-28.)
- `addNodeView` is conditional on `typeof window === 'undefined'`: server-side, it's left
  undefined so no interactive editor chrome renders during SSR; DOM replacement for the
  static/public view is handled separately by `RichTextRenderer`, not by this node's own
  view. A node that unconditionally registers a `NodeView` would either break SSR or ship
  editor-only interactivity to public readers.

A new node follows this same shape: attributes + HTML parse/render for the storage
round-trip, a `NodeView` for the editor-only interactive rendering, and an SSR guard.

## Comment moderation

`backend/app/comments/moderation.py` scores incoming comment text via `score_text`:
OpenAI's moderation endpoint when `OPENAI_API_KEY` is configured, falling back to a
local profanity check (`safetext`) otherwise. `moderate_submission` is invoked as a
background task after a comment is submitted, scoring the comment, its commenter name,
and its tags independently, each on its own DB session (`_moderate` in `moderation.py`).
`MODERATION_THRESHOLD = 0.2` (`moderation.py`) is the score above which a comment
fails automatic moderation; a human reviewer can still override via `ReviewStatus.APPROVED`
even above threshold, or `REJECTED` even below it — the score is a signal into review,
not the final word.

**District comments** (comments scoped to a zone within a map document, via
`DocumentComment` — distinct from CMS page comments) are synced through
`sync_district_comments` (`backend/app/comments/main.py`): each incoming batch is
`{comment_id?, zone, text}`, capped at 240 characters and 10 comments per zone, and an
incoming batch for a zone *replaces* that zone's existing comments rather than appending
— the per-zone count check runs against the incoming batch's own zone counts, not a
merge with what's already stored.

## Territory

- `backend/app/cms/main.py`, `backend/app/cms/models.py` — CMS CRUD, publish, and the
  `TagsCMSContent`/`PlacesCMSContent` models.
- `backend/app/comments/main.py`, `comments/models.py`, `comments/moderation.py` —
  comment submission, district-comment sync, and moderation scoring.
- `backend/app/core/dependencies.py` (`get_document_public`) — where moderation
  placeholder substitution happens for public reads.
- `app/src/app/admin/cms/*`, `app/src/app/admin/review/*` — admin CMS and comment-review
  UI.
- `app/src/app/components/Cms/*` — `RichTextEditor` and its `extensions/` (one directory
  per custom TipTap node).
- `app/src/app/components/RichTextRenderer/*` — public-page render pass; `domNodeReplacers`
  is where each custom node's static DOM replacement lives.
- `app/src/app/store/cmsFormStore.ts` — admin CMS form state.

## See also

- `learn-auth-share` — the `TokenScope` values gating CMS read/write/publish and comment
  review actions.
- `learn-backend` — `get_document_public`, where CMS-adjacent document comments are
  assembled for a public response.
