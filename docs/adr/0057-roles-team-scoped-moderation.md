# 57. Roles are Django groups; moderation is scoped by a fail-closed `teams` claim

Date: 2026-09-23 (PR #712; roles #714; current team form #746/#747, 2026-09-25; recorded retrospectively 2026-09-28)

## Status

Accepted.

## Context

Under Auth0 every admin token carried the same flat scopes ([0021](0021-auth0-scopes.md)); nothing limited a partner to their own portal's submissions. PR #712 first scoped reviewers with a `review_tags` claim listing the comment tags a reviewer may act on, with "an absent claim means unrestricted" so it was safe to deploy before the CMS minted anything. Once the CMS was the issuer ([0055](0055-cms-identity-provider.md)), that fail-open default meant every partner token without the claim was unrestricted — "the exact fail-open bypass this repo's history warns about" (PR #746) — and comment tags stopped being the unit of ownership when submissions replaced comments ([0059](0059-submissions-form-configs.md)).

## Decision

Roles are three Django groups (`authapi/migrations/0002_provision_roles.py`):

- `admin` — all page and datastore permissions; tokens carry every scope, including `review:review-all`.
- `partner` — may add pages under the Portals and Places index pages (`authapi/migrations/0004_scope_partner_add_page.py`, PR #772) and edit those in its teams' scope, with nothing outside it even on its own pages (`TeamScopedPagePermissionTester`), publishing through the approval workflow of [0054](0054-wagtail-cms-service.md); tokens carry only `create:content_review`.
- `super_partner` — partner plus add/change/view on map modules and overlays. GeoPackage import stays admin-only.

`GROUP_SCOPES` (`cms/authapi/scopes.py`) maps groups to scopes. The tenant is the `Team` (`authapi`: `Team`, `TeamMembership`, `TeamDistrictrMap`). Every user token carries `roles`, and every non-admin token carries `teams` — the user's team slugs, `[]` for a team-less user. The backend's `require_portal_admin` (`backend/app/submissions/main.py`) allows moderating a portal only if `teams` shares a slug with that portal's `form_configs.admin_teams`, or the token has `review:review-all`. An absent claim fails closed, and `read:read-all` deliberately does not widen moderation reach. CMS moderation views call the backend with a per-user token so this check lives in one place.

## Alternatives considered

- PR #712's `review_tags` claim with a fail-open default. Replaced in PR #747: tags no longer define ownership, and fail-open made every partner token unrestricted.

## Consequences

Team slugs are part of the auth contract: renaming one orphans the `admin_teams` grants that reference it, and only help text warns (PR #747). Only admins create or copy a config outside the portal wizard; partners get one by creating the page and its config together in the wizard, and `admin_teams` must include one of their own teams. The contract is pinned from both sides (`test_teams_claim_round_trips`, `test_teams_claim_absent_by_default`; `TeamsClaimTests` in the CMS).
