---
name: run-next-upgrade
description: Upgrade Next.js to the latest version following official migration guides and codemods
argument-hint: "[target-version]"
---

# Upgrade Next.js

1. Read `app/package.json` for the current Next.js/React versions.
2. Fetch the official guidance and follow it — codemods:
   https://nextjs.org/docs/app/guides/upgrading/codemods and the
   version-specific guide (adjust the number):
   https://nextjs.org/docs/app/guides/upgrading/version-16
3. Major jumps go one version at a time (13 → 14 → 15), codemods first
   (`npx @next/codemod@latest <transform> <path>`), then dependencies —
   this project uses Bun:
   ```bash
   bun add next@latest react@latest react-dom@latest
   bun add -d @types/react@latest @types/react-dom@latest
   ```
4. Apply the guide's manual breaking changes (`next.config.js`, async APIs),
   then verify: `bun run build`, and exercise key pages under `bun run dev`.
