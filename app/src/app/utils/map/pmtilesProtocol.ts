import maplibregl from 'maplibre-gl';
import {Protocol} from 'pmtiles';

let registered = false;

/**
 * Register the pmtiles:// protocol once for the app's lifetime.
 *
 * Registering/removing per map component races in-flight style source
 * requests: React StrictMode's double-mount removes the protocol while the
 * (often disk-cached, near-instant) pmtiles metadata request is resolving,
 * maplibre never retries the source, and the map wedges before its `load`
 * event — no tiles, no layers, no paint updates. A global protocol handler
 * is stateless per-request, so there is nothing to clean up on unmount.
 */
export const registerPmtilesProtocol = () => {
  if (registered || typeof window === 'undefined') return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  registered = true;
};

// Register at import time: map components create their maplibre instance in a
// child effect that runs BEFORE the parent's own effects, so an effect-time
// registration can lose the race when a disk-cached style JSON resolves
// instantly. Import side effects run well before any React mounting.
registerPmtilesProtocol();
