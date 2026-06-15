/**
 * Development-only helper that publishes Zustand stores on
 * `window.__ZUSTAND_STORES__` so Playwright E2E tests (and manual debugging)
 * can read/write state without going through React.
 *
 * A no-op outside the browser and in production builds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const exposeStoreToWindow = (name: string, store: any): void => {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w.__ZUSTAND_STORES__ = w.__ZUSTAND_STORES__ || {};
  w.__ZUSTAND_STORES__[name] = store;
};

declare global {
  interface Window {
    // Intentionally loose: Playwright e2e helpers cast to their own store shapes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __ZUSTAND_STORES__?: Record<string, any>;
  }
}
