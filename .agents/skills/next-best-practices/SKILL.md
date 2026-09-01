---
name: next-best-practices
description: Districtr's own Next.js conventions — component declaration style, the Bun runtime, client-heavy map pages, statically rendered content pages. Use when writing or reviewing Next.js pages or components in app/.
user-invocable: false
---

# Next.js Conventions (Districtr)

- Use `React.FC<Props>` syntax for reusable component declarations (pages/layouts use
  `export default function` as required by Next.js).
- Runtime is **Bun** (not Node.js); production builds use `output: 'standalone'` and
  deploy to AWS ECS (see `learn-infra`).
- Map pages (`/map/*`) are almost entirely client-side — heavy `'use client'` usage is
  expected there.
- Static content pages (tags, about, etc.) should be **statically rendered** at build
  time where possible.
