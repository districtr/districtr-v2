# 73. CMS feature flags ride the site-settings snapshot and fail open

Date: 2026-11-18 (PR #848)

## Status

Accepted. Amends [0072](0072-maintenance-mode-gates-the-api.md).

## Context

Several features merged to dev at once (the active-layer pills, district focus, the tuning view, district reorder, district labels). We wanted to release them with a way to switch each off in production without a deploy. The frontend already polls `/api/cms/site_settings` every minute for maintenance mode and the banner, and the backend already serves that endpoint from a per-worker snapshot ([0072](0072-maintenance-mode-gates-the-api.md)).

## Decision

`cms.site_settings.feature_flags` is a JSONB object of flag name to boolean. Admins edit it as raw JSON on the CMS's Frontend settings page. It rides the 0072 snapshot and comes back with the rest of the settings, so open tabs follow a change within about a minute. A PATCH replaces the whole object, and the backend accepts only booleans.

On the frontend, `useFeatureFlag` in `store/featureFlagStore.ts` resolves each flag as: a per-browser override (localStorage, set from the console with `featureFlags.set(...)`), then the CMS value, then the default in `DEFAULT_FEATURE_FLAGS`. Every default is on, so a flag the CMS leaves out, an older backend, or a fetch that hasn't landed yet leaves the feature as it shipped. A flag hides only the feature's entry point and leaves its state at the default. It doesn't keep a second code path alive.

## Consequences

Turning a flag off isn't instant for a page that is loading: the feature can show until the first settings fetch lands. Defaults would have to flip to off to hide an unreleased feature from the first paint.

Two admins editing flags at the same time overwrite each other's flag changes, since the object is replaced whole. Other fields on the settings form are unaffected.

A flag that no longer gates anything should be removed from `DEFAULT_FEATURE_FLAGS` and from the CMS help text. A stored value for an unknown flag is ignored.
