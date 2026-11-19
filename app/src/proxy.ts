import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

// Quoted in the CMS Frontend settings help text ("up to a minute").
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
    // An error body (a 500's {"detail": ...}) is not "maintenance off".
    if (!res.ok) throw new Error(`site_settings ${res.status}`);
    const settings = await res.json();
    underConstructionCache = {
      value: settings.under_construction === true,
      fetchedAt: Date.now(),
    };
  } catch {
    // Keep the last value (off on a cold start, so the site stays up) if the
    // API is unreachable or erroring.
    underConstructionCache.fetchedAt = Date.now();
  }
  return underConstructionCache.value;
}

export async function proxy(request: NextRequest) {
  const {pathname, origin} = request.nextUrl;

  if (pathname !== '/under-construction' && (await isUnderConstruction())) {
    // ?next= lets "Try again" return the visitor to the page they asked for.
    const target = new URL('/under-construction', origin);
    if (pathname !== '/') target.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(target, 302);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static assets, and API/auth route handlers.
  matcher: ['/((?!_next/|api/|auth/|.*\\.).*)'],
};
