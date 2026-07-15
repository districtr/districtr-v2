import {auth0} from '@/app/lib/auth0';

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

export async function proxy(request: Request) {
  // Note that proxy uses the standard Request type
  const authRes = await auth0.middleware(request);

  const url = new URL(request.url);
  const pathname = url.pathname;

  // authentication routes — let the middleware handle it
  if (pathname.startsWith('/auth')) {
    return authRes;
  }

  if (pathname.startsWith('/admin')) {
    const session = await auth0.getSession();

    if (!session) {
      return Response.redirect(`${url.origin}/auth/login`, 302);
    }
    return authRes;
  }

  // NOTE All other routes considered public
  if (pathname !== '/under-construction' && (await isUnderConstruction())) {
    return Response.redirect(`${url.origin}/under-construction`, 302);
  }

  return authRes;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - api (API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api).*)',
  ],
};
