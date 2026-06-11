import {getServerSession} from '@/app/lib/auth';

/**
 * Returns the current client session (fresh access token included) for client
 * polling. getServerSession -> auth() runs the NextAuth jwt callback, which
 * silently refreshes an expiring access token — and unlike server components,
 * route handlers CAN write cookies, so the rotated refresh token is persisted
 * back to the session cookie here.
 *
 * Responds with JSON `null` when unauthenticated or the refresh failed.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  return Response.json(session, {headers: {'Cache-Control': 'no-store'}});
}
