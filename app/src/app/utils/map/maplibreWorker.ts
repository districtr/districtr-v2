import {setWorkerUrl} from 'maplibre-gl';

// maplibre-gl 6 derives its worker URL from import.meta.url, which webpack rewrites
// to a file:// path, so the default resolves to '' and no worker starts. This
// new URL(literal, import.meta.url) form makes webpack emit the worker as an asset.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
