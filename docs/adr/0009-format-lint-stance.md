# 9. Format/lint stance: Prettier gated, ESLint available but not gating

Date: 2024-10-28 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

JS code styling was initially informal (PR #156 added an Airbnb-derived Prettier config). Prettier was later wired into the pre-commit hook so formatting stayed consistent across contributors (PR #318). Separately, `next lint` (the project's ESLint entry point) failed on every invocation after the Next 16 / ESLint 9 upgrade: `next lint` was removed in Next 16, and the legacy `.eslintrc.json` could not load under ESLint 9's flat-config default or its legacy-compat shim (PR #728). CI's gates had been skipping it for months by the time this was fixed.

## Decision

Enforce Prettier via pre-commit as a formatting gate. Keep ESLint available and working (PR #728 replaced the broken config with a flat `eslint.config.js` built on `eslint-config-next/core-web-vitals`) but deliberately outside any gate (pre-commit or CI) — a team decision made 2026-08-24 when fixing the tool.

## Consequences

Formatting is enforced automatically and consistently; linting is available for developers to run (`bun run lint`) but a lint failure does not block a commit or a build. PR #728 also disabled the `eslint-plugin-react-hooks` "React Compiler" rule family bundled into `core-web-vitals`, since React Compiler is not enabled in `next.config.mjs` and those rules do not apply under the current runtime.

## Revisit when

React Compiler is enabled in `next.config.mjs` — the disabled "React Compiler" rule family in `eslint.config.js` becomes relevant again at that point.
