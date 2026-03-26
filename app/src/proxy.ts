/**
 * Proxy middleware for the Next.js app.
 * Payload CMS handles its own auth for /admin routes via cookies.
 * All other routes are public.
 */

export function proxy(request: Request) {
  // Pass through all requests — Payload handles admin auth internally
  return new Response(null, {status: 200});
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
