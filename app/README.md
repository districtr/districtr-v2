This is a [Next.js](https://nextjs.org/) project bootstrapped with
[`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

Set up your development environment:

```bash
cp .env.dev .env.local
# install bun
npm i -g bun
# install packages
bun install
```

First, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the
file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to
automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your
feedback and contributions are welcome!

## E2E Testing

This project uses [Playwright](https://playwright.dev/) for end-to-end testing. The test suite
covers static pages, map creation, drawing tools, sidebar interactions, and save/share
functionality.

### Setup

```bash
# Install dependencies (includes Playwright)
bun install

# Install Playwright browsers
bun x playwright install chromium firefox
```

### Running Tests

**From host machine (recommended for simplicity and map/WebGL tests):**

Run backend/frontend with Docker, then execute Playwright on your host machine.

> Recommended default: run Playwright on the host for the simplest setup and fewer container/browser
> issues. Host browsers also use host GPU acceleration, which helps with WebGL-heavy map tests.

> Use `frontend-prod` for E2E runs. It avoids repeated dev recompilation and typically gets tests
> running faster once the image is built.

> **Turnstile:** the session challenge must use Cloudflare's always-pass test site key
> (`NEXT_PUBLIC_TURNSTILE_SESSION_SITE_KEY=1x00000000000000000000AA`). The force-challenge key
> (`3x…FF`) shows an interactive checkbox a headless browser can't pass, so every map waits until it
> times out. `NEXT_PUBLIC_*` values are inlined at build time, so rebuild `frontend-prod` after
> changing it.

```bash
# Start app services (cms serves the static pages' content)
docker-compose up -d db backend cms frontend-prod

# Run all tests
bun run test:e2e

# Run with UI mode for debugging
bun run test:e2e:ui

# Run headed (visible browser)
bun run test:e2e:headed
```

**Inside Docker (optional):**

If you still want to execute Playwright in the container:

```bash
# Start services
docker-compose up -d db backend frontend-prod

# Open a shell in the frontend container
docker-compose exec frontend-prod sh

# Then inside the container:
bun x playwright install
bun run test:e2e
```

**Against a preview/staging environment:**

```bash
# Test against a preview deployment
BASE_URL=https://pr-123.dev.districtr.org bun run test:e2e

# Or use the convenience script
PREVIEW_URL=https://pr-123.dev.districtr.org bun run test:e2e:preview
```

### Test Structure

```
e2e/
├── fixtures/          # Test data and configuration
├── utils/             # Helper utilities for map/canvas testing
├── tests/
│   ├── static/        # Homepage, about, guide, places; axe accessibility scan
│   ├── map/           # Map creation, loading, navigation, evaluation page
│   ├── tools/         # Tools, undo/redo, reset, shatter integrity, WebMCP tools
│   ├── sidebar/       # Data panels, zone picker, sidebar vs. map state
│   ├── save-share/    # Save, share, export/import, two-tab sync conflicts
│   └── coi/           # Community maps
└── global-setup.ts    # Pre-test environment verification
```

### Environment Variables

| Variable           | Description                              | Default                                                    |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| `IS_DOCKER`        | Set to `true` when running inside Docker | `false`                                                    |
| `BASE_URL`         | Target frontend URL                      | `http://localhost:3001` (`frontend-prod`)                  |
| `BACKEND_URL`      | Target backend URL                       | `http://backend:8000` (Docker) or `http://localhost:8000`  |
| `TEST_DOCUMENT_ID` | Specific document ID for tests           | Auto-created                                               |
| `TEST_MAP_SLUG`    | Map slug to use for testing              | `al_congressional_districts`                               |
| `ALLOW_WRITES`     | Enable write tests on remote             | `false`                                                    |

> **Note:** When running inside Docker, use internal network URLs (`frontend:3000`, `backend:8000`).
> When running from host machine, use exposed ports (`localhost:3000`, `localhost:8000`).

### Writing Tests

Never sleep. Wait on state instead:

- `navigateToMap` / `waitForMapSettled` (`fixtures/map-fixture`) wait on readiness attributes the
  app sets in every build, prod included: `data-app-state` and `data-render-state` on
  `[data-testid="map-container"]`, and `data-idle` on `.maplibregl-map`.
- `settleAfter(page, action)` runs a paint/zoom/pan and waits for the repaint it causes.
- `selectTool(page, selector)` makes a tool active. Tool buttons expose `aria-pressed`, and a new map
  opens with the brush already active, so a bare click can toggle it off.

```typescript
test('paints into district 1', async ({page}) => {
  await navigateToMap(page, documentId);
  await selectTool(page, testSelectors.brushTool);
  const before = await assignedIn(page, 1);
  const center = await getMapCenter(page);
  await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
  expect(await assignedIn(page, 1)).toBeGreaterThan(before);
});
```

`static/accessibility.spec.ts` fails on serious/critical axe violations not listed in its `KNOWN`
backlog. Fix a violation, then delete it from `KNOWN`; the report notes stale entries.

### WebMCP

The map editor registers [WebMCP](https://webmachinelearning.github.io/webmcp/) tools
(`src/app/hooks/useWebMcpTools.ts`) whenever the browser exposes `document.modelContext`:
`get_map_state`, `get_district_summary`, `list_loaded_areas`, `set_tool`, `set_district`,
`assign_areas`. Playwright 1.64+ calls them through `page.webmcp` (typed wrappers in
`e2e/utils/webmcp.ts`), so specs assert on map state instead of diffing canvas screenshots.
`playwright.config.ts` enables WebMCP for the Chromium (`--enable-features=WebMCP`) and Firefox
projects. Specs that need it call `skipWithoutWebMcp(page)`.

To try the tools by hand in Chrome 149+, enable `chrome://flags/#enable-webmcp-testing` and open a
map. Chrome's Model Context Tool Inspector extension lists and calls them.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the
[Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)
from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more
details.

## CMS and Custom Components

We use TipTap for rich text editing. It compiles rich text to a nice JSON format that we toss to the
backed as JSONB.

Custom components in the CMS have three components:

1. Node - the configuration for TipTap to ingest the node schema
2. Node View - the editor view of what the node looks like while editing
3. Node Renderer - the output of the node for the frontend

In many cases, the view and renderer may be similar, but in other cases the view may need more
interactivity while the renderer should work with SSR. For this reason, we use `html-react-parser`
and a few dom node replacers configured under `components/RichTextRenderer` to help out convert from
TipTap's generated HTML to more ergonomic react.

This can be extended for both SSR and CSR components!
