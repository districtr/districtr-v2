import {NextRequest} from 'next/server';
import {handlers} from '@/auth';
import {toClientSession} from '@/app/lib/auth';

/**
 * Returns the current client session (fresh access token included) for client
 * polling.
 *
 * This proxies Auth.js's own /auth/session handler rather than calling auth()
 * bare: a bare auth() in a route handler runs the jwt callback (refreshing an
 * expiring token) but DISCARDS the Set-Cookie carrying the rotated pair, so
 * the browser would keep polling with the original refresh token until it
 * expired mid-session. The proxied handler's Set-Cookie headers are forwarded
 * so the rotation is persisted.
 *
 * Responds with JSON `null` when unauthenticated or the refresh failed.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionRequest = new NextRequest(new URL('/auth/session', request.url), {
    headers: request.headers,
  });
  const upstream = await handlers.GET(sessionRequest);
  const session = upstream.ok ? await upstream.json() : null;

  const response = Response.json(toClientSession(session), {
    headers: {'Cache-Control': 'no-store'},
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}
