import {auth0} from '@/app/lib/auth0';

export async function proxy(request: Request) {
  const authRes = await auth0.middleware(request);

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Auth0 authentication routes
  if (pathname.startsWith('/auth')) {
    return authRes;
  }

  // Payload CMS admin panel — Payload handles its own auth via cookies
  if (pathname.startsWith('/admin')) {
    return authRes;
  }

  // Payload API routes — Payload handles its own auth
  if (pathname.startsWith('/api/users')) {
    return authRes;
  }

  // All other routes are public
  return authRes;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
