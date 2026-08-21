import {NextRequest, NextResponse} from 'next/server';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

// Runs server-side because the legacy site doesn't send CORS headers.
// `path` may carry a query string; the id capture stops at `?` so it survives.
const PLAN_ROUTE = /^\/(edit|plan|coi)\/([^/?#]+)/i;
// /embedded carries its id as a query param instead of a path segment (e.g.
// /embedded?id=47448, used by third-party iframe embeds), so it needs its own
// extraction rather than joining PLAN_ROUTE's alternation.
const EMBEDDED_ROUTE = /^\/embedded(?:[/?]|$)/i;
const HEAD = (url: string, ms = 5000) =>
  fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(ms)});

// /edit|/plan|/coi|/embedded are all blind-200 rewrites (static files; legacy's
// server never inspects the id) — the real answer is the data API (200 = found,
// 500 = not). Returns null for every other route shape.
function planIdFor(path: string): string | null {
  const planMatch = path.match(PLAN_ROUTE);
  if (planMatch) return planMatch[2];
  if (EMBEDDED_ROUTE.test(path)) {
    return new URLSearchParams(path.split('?')[1] ?? '').get('id');
  }
  return null;
}

export const GET = async (req: NextRequest) => {
  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!path.startsWith('/') || path.startsWith('//')) {
    return NextResponse.json({exists: false});
  }
  let exists = false;
  try {
    const id = planIdFor(path);
    if (id) {
      const res = await HEAD(
        `${LEGACY_DISTRICTR_URL}/.netlify/functions/planRead?id=${encodeURIComponent(id)}`,
        10_000 // cold start + Mongo connect
      );
      exists = res.ok;
    } else {
      const res = await HEAD(`${LEGACY_DISTRICTR_URL}${path}`);
      if (res.redirected) {
        // /:place/:plan (+ /eval, /portal variants) 302 to /edit?url=/assets/:place-plans/:plan.json —
        // the asset's existence is the real answer (missing assets 404 cleanly).
        const assetUrl = new URL(res.url).searchParams.get('url');
        if (assetUrl?.startsWith('/') && !assetUrl.startsWith('//')) {
          exists = (await HEAD(`${LEGACY_DISTRICTR_URL}${assetUrl}`)).ok;
        } else {
          // No url param: misses hit the `/* / 302` catch-all and land exactly on the homepage;
          // legit redirects (/new/mi/* -> /michigan) land elsewhere.
          exists = res.ok && new URL(res.url).pathname !== '/';
        }
      } else {
        exists = res.ok;
      }
    }
  } catch {
    // fail closed: no redirect offered
  }
  return NextResponse.json({exists});
};
