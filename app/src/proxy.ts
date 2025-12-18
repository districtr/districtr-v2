import {auth0} from '@/app/lib/auth0';

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
