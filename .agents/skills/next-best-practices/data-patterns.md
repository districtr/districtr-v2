# Data Patterns

Choose the right data fetching pattern for each use case.

## Districtr Architecture

The app has a **separate FastAPI backend** — there is no direct database access from Next.js. All data flows through API handlers in `src/app/utils/api/`.

- **Map pages** (`/map/*`) are almost entirely client-side. The server component is a thin shell that extracts params and renders the client `<MapPage>`. Client components fetch data via the API factory + Zustand stores.
- **Static pages** (tags, about, etc.) should be **statically rendered** at build time where possible.
- **Server Actions are not used.** All mutations go through the API handler factory.
- **Much of the data comes from CDN**, not the API — map vector tiles (PMTiles), demographic data (Parquet files via `hyparquet`), and static assets are served from a CDN and loaded directly by the client.

### Districtr Data Stack

| Layer | Tool | Location |
|-------|------|----------|
| API calls | Fetch factory with result types | `src/app/utils/api/factory.ts` |
| API handlers | Per-endpoint functions | `src/app/utils/api/apiHandlers/` |
| Server state | React Query (limited — see note) | `src/app/utils/api/queries.ts` |
| Client state | Zustand (primary) | `src/app/store/` |
| Persistence | IndexedDB via Dexie | `src/app/store/` |

### React Query: Avoid on Map Pages

React Query (`@tanstack/react-query`) has been tricky for this application. Map pages require fine-grained control over when fetches fire, how results merge into Zustand state, and how map renders are triggered — React Query's automatic refetching and caching semantics conflict with that. **Avoid React Query on mapping pages.** Prefer direct API handler calls with manual Zustand updates. React Query is acceptable for simpler list/browse pages where its caching is a net win.

### API Factory Pattern

All backend calls use a factory that returns discriminated union results:

```tsx
// src/app/utils/api/factory.ts
const handler = make('/api/endpoint')(method, options);
const result = await handler({ body, session });

if (!result.ok) {
  // result.error.detail contains the error message
  return;
}
// result.response contains typed data
```

## Decision Tree

```
Need to fetch data?
├── From a Server Component (page/layout)?
│   └── Fetch from external API via handler function
│       (used for metadata, initial props)
│
├── From a Client Component?
│   ├── Is it a mutation?
│   │   └── Use: API handler via factory → Zustand update
│   └── Is it a read?
│       ├── Map page? → API handler via factory → Zustand
│       │   (avoid React Query — too coarse for map state)
│       └── List/browse page? → React Query or API handler
│
└── Need a Next.js route handler (OG images, config)?
    └── Use: Route Handler (app/api/)
```

## Server Component Fetching

Server components fetch from the external API for metadata and initial page data:

```tsx
// app/(interactive)/map/[map_id]/page.tsx
export default async function ViewPage({ params }: MapPageProps) {
  const { map_id } = await params;
  return <MapPage isEditing={false} mapId={map_id} />;
}

export async function generateMetadata({ params }: MapPageProps): Promise<Metadata> {
  const { map_id } = await params;
  // Fetch from external API for OG metadata
  return generateMapPageMetadata(map_id);
}
```

## Client Component Data Fetching

Most data fetching happens in client components via the API factory:

```tsx
'use client';

// Read: via API handler
const result = await getAvailableDistrictrMaps({ limit, offset });
if (!result.ok) {
  throw new Error(result.error.detail);
}
const maps = result.response;

// Mutation: via API handler → Zustand update
const response = await saveMapDocumentMetadata({ body, session });
if (response.ok) {
  updateMetadata(updates);  // Zustand store
} else {
  setErrorNotification({ message: response.error.detail });
}
```

## Avoiding Data Waterfalls

### Problem: Sequential Fetches

```tsx
// Bad: Sequential waterfalls
async function Dashboard() {
  const user = await getUser();        // Wait...
  const posts = await getPosts();      // Then wait...
  const comments = await getComments(); // Then wait...

  return <div>...</div>;
}
```

### Solution 1: Parallel Fetching with Promise.all

```tsx
// Good: Parallel fetching
async function Dashboard() {
  const [user, posts, comments] = await Promise.all([
    getUser(),
    getPosts(),
    getComments(),
  ]);

  return <div>...</div>;
}
```

### Solution 2: Streaming with Suspense

```tsx
import { Suspense } from 'react';

async function Dashboard() {
  return (
    <div>
      <Suspense fallback={<UserSkeleton />}>
        <UserSection />
      </Suspense>
      <Suspense fallback={<PostsSkeleton />}>
        <PostsSection />
      </Suspense>
    </div>
  );
}
```
