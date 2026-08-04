import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {auth} from '@/auth';

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

const adminProxy = auth(request => {
  const {pathname, search, origin} = request.nextUrl;

  const session = request.auth;
  // No session, or the silent token refresh failed — force re-login
  if (!session?.user || session.error === 'RefreshTokenError') {
    const loginUrl = new URL('/auth/login', origin);
    loginUrl.searchParams.set('returnTo', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export async function proxy(request: NextRequest, event: unknown) {
  const {pathname, origin} = request.nextUrl;

  /*
   * Only run the auth() middleware where the session is actually used: /admin
   * is the only gated surface. Running auth() on every public page would
   * invoke the jwt callback — and a token refresh — on anonymous traffic for
   * no benefit; the /auth routes are route handlers and do not depend on
   * middleware. Admin stays reachable during under-construction mode.
   */
  if (pathname.startsWith('/admin')) {
    return (adminProxy as any)(request, event);
  }

  if (pathname !== '/under-construction' && (await isUnderConstruction())) {
    return NextResponse.redirect(`${origin}/under-construction`, 302);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static assets, and API/auth route handlers.
  matcher: ['/((?!_next/|api/|auth/|.*\\.).*)'],
};
