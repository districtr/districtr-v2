'use client';
import {useEffect} from 'react';
import {useCmsFormStore} from '../store/cmsFormStore';
import {ClientSession} from '@/app/lib/auth0';
import {migrateUserMapsFromLocalStorage} from '../utils/idb/migrateUserMaps';
// import { UserProvider } from '@auth0/nextjs-auth0/client';

export const Providers: React.FC<{
  children: React.ReactNode;
  session: ClientSession | null | undefined;
}> = ({session, children}) => {
  const setSession = useCmsFormStore(state => state.setSession);

  useEffect(() => {
    session && setSession(session);
  }, [session]);

  // Run migration on app load
  useEffect(() => {
    migrateUserMapsFromLocalStorage();
  }, []);

  return <div>{children}</div>;
};
