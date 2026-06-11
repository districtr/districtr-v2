'use client';
import {useEffect} from 'react';
import {useCmsFormStore} from '../store/cmsFormStore';
import {ClientSession} from '@/app/lib/auth';

/**
 * CMS access tokens live ~10 minutes; re-fetch the session well inside that
 * window so the token in the store never goes stale mid-session.
 */
const SESSION_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

export const Providers: React.FC<{
  children: React.ReactNode;
  session: ClientSession | null | undefined;
}> = ({session, children}) => {
  const setSession = useCmsFormStore(state => state.setSession);

  useEffect(() => {
    session && setSession(session);
  }, [session]);

  // Keep the store's access token fresh: /auth/token re-runs the NextAuth jwt
  // callback (refreshing + persisting rotated tokens) and returns the session.
  // Only poll when the server rendered an authenticated session to begin with.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/auth/token', {cache: 'no-store'});
        if (!response.ok) return;
        const freshSession: ClientSession | null = await response.json();
        if (freshSession) {
          setSession(freshSession);
        }
      } catch {
        // Transient network failure — keep the current session, retry next tick
      }
    }, SESSION_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, setSession]);

  return <div>{children}</div>;
};
