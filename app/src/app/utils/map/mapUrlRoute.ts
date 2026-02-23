
const routeManager = {
  // Behold! A fancy custom `get` method!
  // This lets us dynamically get the current map route based on the URL pathname, but without calling a function
  // A static variable above would only update when the script re-evauluates, which would be on page load, not when the URL changes
  get mapUrlRoute() {
    const pathname = typeof window !== 'undefined' ? (window.location?.pathname ?? '') : '';
    return pathname.startsWith('/coi') ? 'coi' : 'map';
  },
};

export const currMapRoute = routeManager.mapUrlRoute;
