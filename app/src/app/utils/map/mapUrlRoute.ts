// Always read via `routeManager.mapUrlRoute` (getter); do NOT destructure — a
// captured value won't update across SPA navigations.
export const routeManager = {
  get mapUrlRoute() {
    const pathname = typeof window !== 'undefined' ? (window.location?.pathname ?? '') : '';
    return pathname.startsWith('/coi') ? 'coi' : 'map';
  },
};
