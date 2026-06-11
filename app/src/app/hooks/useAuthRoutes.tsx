'use client';

import {useRouter} from 'next/navigation';

export const useAuthRoutes = () => {
  const router = useRouter();

  const signOut = () => {
    router.push('/auth/logout');
  };
  const signIn = () => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    router.push(`/auth/login?returnTo=${returnTo}`);
  };
  return {
    signOut,
    signIn,
  };
};
