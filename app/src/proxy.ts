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
  /*
   * Only run the auth() middleware where the session is actually used: /admin
   * is the only gated surface (the logic above only checks /admin). Running
   * auth() on every public page would invoke the jwt callback — and a token
   * refresh — on anonymous traffic for no benefit; the /auth routes are route
   * handlers and do not depend on middleware.
   */
  matcher: ['/admin/:path*'],
};
