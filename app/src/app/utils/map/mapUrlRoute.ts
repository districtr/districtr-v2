// Export `routeManager` so callers get a live-read via the getter. The previous
// `export const currMapRoute = routeManager.mapUrlRoute` captured the value at
// module-evaluation time and never updated across SPA navigations — COI pages
// routed through "map" and vice versa.
//
// Usage: `routeManager.mapUrlRoute` inside render/handler code; do NOT destructure.
export const routeManager = {
  get mapUrlRoute() {
    const pathname = typeof window !== 'undefined' ? (window.location?.pathname ?? '') : '';
    return pathname.startsWith('/coi') ? 'coi' : 'map';
  },
};
