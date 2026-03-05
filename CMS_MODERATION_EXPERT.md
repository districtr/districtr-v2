# CMS_MODERATION_EXPERT

## Purpose
Define CMS authoring/review flows, TipTap extension expectations, and moderation/review semantics for comments and district comments.

## When To Use
- You are editing admin CMS UI or backend CMS endpoints.
- You are changing moderation thresholds, review states, or public/admin comment visibility.
- You are adding TipTap custom nodes/renderers.

## Canonical Files
- `app/src/app/admin/cms/*`
- `app/src/app/admin/review/*`
- `app/src/app/components/Cms/*`
- `app/src/app/store/cmsFormStore.ts`
- `backend/app/cms/main.py`
- `backend/app/cms/models.py`
- `backend/app/comments/main.py`
- `backend/app/comments/models.py`
- `backend/app/comments/moderation.py`

## Hard Invariants
- CMS content authoring and publishing must preserve role/scope boundaries.
- Review statuses (`REVIEWED`, `APPROVED`, `REJECTED`) must remain semantically consistent.
- Public comment responses must respect moderation masking rules.
- District comments sync path (via assignments update) must preserve limits and zone association.
- TipTap extensions must support both editor behavior and frontend rendering behavior.

## Preferred Patterns
- Reuse existing API handlers/store actions for CMS CRUD + publish flows.
- Keep moderation and review behavior centralized in backend comments module.
- Keep admin filtering behavior aligned with backend query params.
- Add tests when changing moderation/review behavior.

## Anti-Patterns
- Introducing divergent moderation logic in frontend-only code.
- Returning unmoderated content to public views.
- Changing review enum semantics without migration/test updates.
- Editing TipTap schema/view/renderer in only one place.

## Change Checklist
1. Confirm role-scoped read/write/publish behavior.
2. Confirm moderation threshold behavior for public vs admin visibility.
3. Confirm district-comment sync constraints remain enforced.
4. Confirm TipTap content renders correctly in editor and display mode.
5. Confirm admin review filters still map to backend behavior.

## Validation Commands
- `cd backend && pytest -v tests/test_comments.py tests/test_cms.py`
- `cd app && bun run build`

## See Also
- [AUTH_SHARE_SECURITY_EXPERT.md](./AUTH_SHARE_SECURITY_EXPERT.md) - Authentication and security for protected CMS operations
- [BE_EXPERT.md](./BE_EXPERT.md) - Backend CMS endpoints and models

## Common Failure Modes
- Review status updates not reflected in admin lists due to filter mismatch.
- Public comments leaking rejected content.
- District comments orphaned from document/zone references.
- CMS draft/published state confusion from inconsistent update flow.
