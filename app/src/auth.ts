import NextAuth, {type DefaultSession} from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type {JWT} from 'next-auth/jwt';
import {decodeJwtPayload} from '@/app/utils/jwt';

const CMS_URL = process.env.CMS_URL ?? 'http://localhost:8001';

/** Seconds before access-token expiry at which we proactively refresh. */
const REFRESH_BUFFER_MS = 60_000;

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: 'RefreshTokenError';
    user: {
      roles?: string[];
    } & DefaultSession['user'];
  }
  interface User {
    roles?: string[];
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Epoch millis at which the access token expires. */
    accessTokenExpires?: number;
    roles?: string[];
    error?: 'RefreshTokenError';
  }
}

/**
 * Exchange a refresh token for a new access/refresh pair. The CMS rotates
 * refresh tokens: a new refresh token replaces the old one, so we must persist
 * BOTH the new access token and the new refresh token.
 */
const doRefreshAccessToken = async (token: JWT): Promise<JWT> => {
  try {
    const response = await fetch(`${CMS_URL}/api/token/refresh/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh: token.refreshToken}),
    });
    if (!response.ok) {
      throw new Error(`Token refresh failed with status ${response.status}`);
    }
    const data: {access: string; refresh?: string} = await response.json();
    const payload = decodeJwtPayload(data.access);
    return {
      ...token,
      accessToken: data.access,
      // Rotation: store the new refresh token, never reuse the old one
      refreshToken: data.refresh ?? token.refreshToken,
      accessTokenExpires: (payload?.exp ?? 0) * 1000,
      error: undefined,
    };
  } catch (error) {
    console.error('Error refreshing access token', error);
    // Surface the failure so the UI can force a re-login
    return {...token, error: 'RefreshTokenError'};
  }
};

/** In-flight refreshes, keyed by the refresh token being exchanged. */
const refreshesInFlight = new Map<string, Promise<JWT>>();

/**
 * Single-flight wrapper around the token refresh: concurrent jwt-callback
 * invocations within this bundle (e.g. parallel requests racing the same
 * expired access token) share one POST instead of each spending the rotating
 * refresh token.
 */
const refreshAccessToken = (token: JWT): Promise<JWT> => {
  const key = token.refreshToken ?? '';
  const inFlight = refreshesInFlight.get(key);
  if (inFlight) return inFlight;
  const refresh = doRefreshAccessToken(token).finally(() => {
    refreshesInFlight.delete(key);
  });
  refreshesInFlight.set(key, refresh);
  return refresh;
};

export const {handlers, auth, signIn, signOut} = NextAuth({
  basePath: '/auth',
  trustHost: true,
  session: {strategy: 'jwt'},
  pages: {
    signIn: '/auth/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: {label: 'Email', type: 'email'},
        password: {label: 'Password', type: 'password'},
      },
      authorize: async credentials => {
        if (!credentials?.email || !credentials?.password) return null;
        const response = await fetch(`${CMS_URL}/api/token/`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            username: credentials.email,
            password: credentials.password,
          }),
        });
        if (!response.ok) return null;
        const data: {access: string; refresh: string} = await response.json();
        const payload = decodeJwtPayload(data.access);
        if (!payload) return null;
        return {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          roles: payload.roles ?? [],
          accessToken: data.access,
          refreshToken: data.refresh,
          accessTokenExpires: (payload.exp ?? 0) * 1000,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({token, user}) => {
      // Initial sign-in: persist the CMS token pair on the NextAuth JWT
      if (user) {
        return {
          ...token,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpires: user.accessTokenExpires,
          roles: user.roles,
        };
      }
      // Access token still valid (with a buffer) — keep it
      if (Date.now() < (token.accessTokenExpires ?? 0) - REFRESH_BUFFER_MS) {
        return token;
      }
      // Expired or about to expire — silently refresh
      return refreshAccessToken(token);
    },
    session: async ({session, token}) => {
      session.user.roles = token.roles ?? [];
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
