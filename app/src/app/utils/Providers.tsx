'use client';

/**
 * Client-side providers wrapper.
 * Auth0 session injection removed — Payload CMS handles auth.
 */
export const Providers: React.FC<{
  children: React.ReactNode;
}> = ({children}) => {
  return <div>{children}</div>;
};
