import {auth} from '@/auth';

export type SessionUser = {
  email?: string | null;
  name?: string | null;
  roles?: string[];
};

/**
 * Serializable session shape passed from server components to the client.
 * Mirrors the shape previously provided by @auth0/nextjs-auth0.
 */
export type ClientSession = {
  user?: SessionUser;
  tokenSet?: {
    accessToken: string;
  };
};

/**
 * Map an Auth.js session (from auth() or the /auth/session endpoint's JSON)
 * to the serializable client shape. Null when unauthenticated or when the
 * silent token refresh has failed (forcing a re-login).
 */
export const toClientSession = (
  session: {
    user?: SessionUser;
    accessToken?: string;
    error?: string;
  } | null
): ClientSession | null => {
  if (!session?.user || session.error === 'RefreshTokenError') {
    return null;
  }
  return {
    user: {
      email: session.user.email,
      name: session.user.name,
      roles: session.user.roles ?? [],
    },
    tokenSet: session.accessToken ? {accessToken: session.accessToken} : undefined,
  };
};

/**
 * Server-side session helper. Returns null when unauthenticated or when the
 * silent token refresh has failed (forcing a re-login).
 *
 * NOTE: server components cannot write cookies, so a refresh that happens
 * here is not persisted — that is fine for rendering, but polling endpoints
 * must go through Auth.js's own handler instead (see app/auth/token/route.ts).
 */
export const getServerSession = async (): Promise<ClientSession | null> =>
  toClientSession(await auth());
