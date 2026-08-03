import {NextRequest, NextResponse} from 'next/server';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

// `path` may carry a query string; the id capture stops at `?` so it survives.
const PLAN_ROUTE = /^\/(edit|plan|coi)\/([^/?#]+)/i;
const HEAD = (url: string, ms = 5000) =>
  fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(ms)});

export const GET = async (req: NextRequest) => {
  const path = req.nextUrl.searchParams.get('path') ?? '';
  if (!path.startsWith('/') || path.startsWith('//')) {
    return NextResponse.json({exists: false});
  }
  let exists = false;
  try {
    const plan = path.match(PLAN_ROUTE);
    if (plan) {
      // /edit|/plan|/coi are blind-200 rewrites; the data API is the real check (200 = found, 500 = not).
      const res = await HEAD(
        `${LEGACY_DISTRICTR_URL}/.netlify/functions/planRead?id=${encodeURIComponent(plan[2])}`,
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
