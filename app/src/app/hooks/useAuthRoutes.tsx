'use client';

import {useRouter} from 'next/navigation';

export const useAuthRoutes = () => {
  const router = useRouter();

  const signOut = () => {
    router.push('/auth/logout');
  };
  const signIn = () => {
    router.push('/auth/login');
  };
  return {
    signOut,
    signIn,
  };
};
