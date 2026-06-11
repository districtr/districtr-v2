import {signOut} from '@/auth';
import {NextResponse} from 'next/server';

/**
 * Preserves the pre-Auth.js URL contract: the app signs users out by
 * navigating to GET /auth/logout (see hooks/useAuthRoutes.tsx).
 *
 * CSRF guard: a GET logout can be triggered cross-site — a top-level <a> click
 * or scripted redirect on a malicious page would log the user out against their
 * will. SameSite=Lax already blocks subresource drive-bys (e.g. <img>), but NOT
 * a cross-site top-level navigation. We use the Fetch Metadata `Sec-Fetch-Site`
 * request header to allow only first-party requests (same-origin / same-site)
 * and direct user navigation (typed URL or bookmark report "none"); an explicit
 * "cross-site" request bounces home WITHOUT signing out. Browsers too old to
 * send the header fall through to the prior behavior.
 */
export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  await signOut({redirectTo: '/'});
}
