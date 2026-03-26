import {useAuth} from '@payloadcms/ui';
import {AppSession} from '@/app/lib/session';

/**
 * Returns an Auth0-shaped session object backed by the Payload CMS auth token.
 * Uses Payload's internal useAuth() hook which has access to the token
 * (the payload-token cookie is HttpOnly, so document.cookie can't read it).
 *
 * This allows existing API handlers (which accept `session?: AppSession`)
 * to work with Payload auth without changes to the API layer.
 *
 * Must be used inside Payload admin views only.
 */
export function usePayloadSession(): AppSession | null {
  const {token} = useAuth();
  if (!token) return null;
  return {
    tokenSet: {accessToken: token},
  } as AppSession;
}
