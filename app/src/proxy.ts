import {NextResponse} from 'next/server';
import {auth} from '@/auth';

export const proxy = auth(request => {
  const {pathname, search, origin} = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const session = request.auth;
    // No session, or the silent token refresh failed — force re-login
    if (!session?.user || session.error === 'RefreshTokenError') {
      const loginUrl = new URL('/auth/login', origin);
      loginUrl.searchParams.set('returnTo', `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  // NOTE All other routes considered public
  return NextResponse.next();
});

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
