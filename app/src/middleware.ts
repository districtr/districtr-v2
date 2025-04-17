import {NextResponse, NextRequest} from 'next/server';
import {auth0} from '@/app/lib/auth0';

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  // authentication routes — let the middleware handle it
  if (request.nextUrl.pathname.startsWith('/auth')) {
    return authRes;
  }

  if (request.nextUrl.pathname.startsWith('/admin')) {
    const {origin} = new URL(request.url);
    const session = await auth0.getSession();

    if (!session) {
      return NextResponse.redirect(`${origin}/auth/login`);
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
