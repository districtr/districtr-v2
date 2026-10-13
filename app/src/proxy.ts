import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

const UNDER_CONSTRUCTION_TTL_MS = 60_000;
let underConstructionCache = {value: false, fetchedAt: 0};

async function isUnderConstruction(): Promise<boolean> {
  // Env override for planned downtime: forces maintenance mode even when the
  // backend (where the DB flag lives) is itself down. Read at request time,
  // so it applies to every instance from its first request.
  if (process.env.UNDER_CONSTRUCTION === 'true') {
    return true;
  }
  if (Date.now() - underConstructionCache.fetchedAt < UNDER_CONSTRUCTION_TTL_MS) {
    return underConstructionCache.value;
  }
  try {
    const apiUrl = process.env.NEXT_SERVER_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${apiUrl}/api/cms/site_settings`);
    const settings = await res.json();
    underConstructionCache = {
      value: settings.under_construction === true,
      fetchedAt: Date.now(),
    };
  } catch {
    // fail open: keep the site up if the API is unreachable
    underConstructionCache.fetchedAt = Date.now();
  }
  return underConstructionCache.value;
}

export async function proxy(request: NextRequest) {
  const {pathname, origin} = request.nextUrl;

  if (pathname !== '/under-construction' && (await isUnderConstruction())) {
    return NextResponse.redirect(`${origin}/under-construction`, 302);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static assets, and API/auth route handlers.
  matcher: ['/((?!_next/|api/|auth/|.*\\.).*)'],
};
