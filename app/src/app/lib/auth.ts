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
 * Server-side session helper. Returns null when unauthenticated or when the
 * silent token refresh has failed (forcing a re-login).
 */
export const getServerSession = async (): Promise<ClientSession | null> => {
  const session = await auth();
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
