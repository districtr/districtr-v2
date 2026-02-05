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

This project uses [Playwright](https://playwright.dev/) for end-to-end testing. The test suite covers static pages, map creation, drawing tools, sidebar interactions, and save/share functionality.

### Setup

```bash
# Install dependencies (includes Playwright)
bun install

# Install Playwright browsers
npx playwright install
```

### Running Tests

**Inside Docker (recommended):**

Run the tests inside a Docker container alongside the other services:

```bash
# From the project root - start services and run tests
docker-compose --profile e2e up e2e

# Or run with existing services already running
docker-compose --profile e2e run --rm e2e

# Run specific test file
docker-compose --profile e2e run --rm e2e bun run test:e2e tests/static/homepage.spec.ts

# Run specific test suite
docker-compose --profile e2e run --rm e2e bun run test:e2e tests/tools/
```

**From host machine (alternative):**

If you prefer to run tests from your host machine:

```bash
# Make sure docker-compose is running
docker-compose up -d

# Install Playwright browsers (first time only)
npx playwright install

# Run all tests
bun run test:e2e

# Run with UI mode for debugging
bun run test:e2e:ui

# Run headed (visible browser)
bun run test:e2e:headed
```

**Against a preview/staging environment:**

```bash
# Test against a Fly.io preview deployment
BASE_URL=https://districtr-v2-pr-123.fly.dev bun run test:e2e

# Or use the convenience script
PREVIEW_URL=https://districtr-v2-pr-123.fly.dev bun run test:e2e:preview
```

### Test Structure

```
e2e/
├── fixtures/          # Test data and configuration
├── utils/             # Helper utilities for map/canvas testing
├── tests/
│   ├── static/        # Homepage, about, guide, places
│   ├── map/           # Map creation, loading, navigation
│   ├── tools/         # Brush, eraser, pan, shatter tools
│   ├── sidebar/       # Data panels, zone picker
│   └── save-share/    # Save, share, reset functionality
└── global-setup.ts    # Pre-test environment verification
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IS_DOCKER` | Set to `true` when running inside Docker | `false` |
| `BASE_URL` | Target frontend URL | `http://frontend:3000` (Docker) or `http://localhost:3000` |
| `BACKEND_URL` | Target backend URL | `http://backend:8000` (Docker) or `http://localhost:8000` |
| `TEST_DOCUMENT_ID` | Specific document ID for tests | Auto-created |
| `TEST_MAP_SLUG` | Map slug to use for testing | `pennsylvania_vtd` |
| `ALLOW_WRITES` | Enable write tests on remote | `false` |

> **Note:** When running inside Docker, use internal network URLs (`frontend:3000`, `backend:8000`). When running from host machine, use exposed ports (`localhost:3000`, `localhost:8000`).

### Writing Tests

Canvas/map interactions use helper utilities:

```typescript
import { getMapCenter, paintAtCoordinates, waitForMapLoad } from '../../utils/map-helpers';

test('should paint on map', async ({ page }) => {
  await page.goto('/map/edit/document-id');
  await waitForMapLoad(page);
  
  // Select brush tool
  await page.getByTestId('brush-tool').click();
  
  // Paint at map center
  const center = await getMapCenter(page);
  await paintAtCoordinates(page, center.x, center.y);
});
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the
[Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)
from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more
details.


## CMS and Custom Components

We use TipTap for rich text editing. It compiles rich text to a nice JSON format that we toss to the backed as JSONB. 

Custom components in the CMS have three components:
1. Node - the configuration for TipTap to ingest the node schema
2. Node View - the editor view of what the node looks like while editing
3. Node Renderer - the output of the node for the frontend

In many cases, the view and renderer may be similar, but in other cases the view may need more interactivity while the renderer should work with SSR. For this reason, we use `html-react-parser` and a few dom node replacers configured under `components/RichTextRenderer` to help out convert from TipTap's generated HTML to more ergonomic react. 

This can be extended for both SSR and CSR components!