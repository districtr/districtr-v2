import {getPayloadToken} from '@/app/utils/api/payloadAuth';
import {ClientSession} from '@/app/lib/auth0';

/**
 * Returns an Auth0-shaped session object backed by the Payload CMS cookie token.
 * This allows existing API handlers (which accept `session?: ClientSession`) to
 * work with Payload auth without any changes to the API layer.
 *
 * Returns null if no Payload token is present (user not logged in).
 */
export function usePayloadSession(): ClientSession | null {
  const token = getPayloadToken();
  if (!token) return null;
  return {
    tokenSet: {accessToken: token},
  } as ClientSession;
}
