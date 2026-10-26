'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {Overlay} from '@utils/api/apiHandlers/types';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {dissolve} from '@turf/turf';
import {Feature, GeoJSONFeature, MapGeoJSONFeature, Map as MaplibreMap} from 'maplibre-gl';
import {COUNTY_SOURCE_ID} from '@constants/map/layerIds';
import {overlayIdOf} from '@constants/map/paintBy';

const COUNTY_SOURCE_LAYER = 'tl_2023_us_county';

/** The pieces of one area (overlay or county feature) in the loaded tiles; a
 * feature split across tiles comes back as several. The built-in county layer
 * is a pseudo-overlay with its own source and source-layer, and vector
 * (pmtiles) sources return nothing unless sourceLayer is passed. */
export const queryAreaFeatures = (
  map: MaplibreMap,
  layerId: string,
  featureId: string
): GeoJSONFeature[] => {
  const sourceLayer = useMapStore
    .getState()
    .mapDocument?.overlays?.find(o => o.overlay_id === layerId)?.source_layer;
  const sourceFeatures =
    layerId === COUNTY_SOURCE_ID
      ? map.querySourceFeatures(COUNTY_SOURCE_ID, {
          sourceLayer: COUNTY_SOURCE_LAYER,
          filter: ['==', ['get', 'GEOID'], featureId],
        })
      : map.querySourceFeatures(
          `overlay-source-${layerId}`,
          sourceLayer ? {sourceLayer} : undefined
        );
  // String compare: promoteId keeps numeric ids as numbers.
  return (sourceFeatures ?? []).filter(feature => String(feature.id) === String(featureId));
};

/** Overlay name for an overlay_id; overlays sharing a name toggle as one group. */
export const getOverlayName = (overlayId: string) =>
  useMapStore.getState().mapDocument?.overlays?.find(o => o.overlay_id === overlayId)?.name;

/** The overlay a same-name group masks through: only line overlays get the
 * invisible fill layer that mask selection clicks (see OverlayLayers). */
export const getMaskOverlayId = (overlays: Overlay[], name: string) =>
  overlays.find(o => o.name === name && o.layer_type === 'line')?.overlay_id;

export interface OverlayPaintConstraint {
  overlayId: string;
  featureId: string;
  features: MapGeoJSONFeature[];
  featureName?: string;
}

/** Painting by overlay area needs that overlay drawn (its areas are what the
 * brush hits), so showing only the mask layer never hides it. */
const withPaintByOverlay = (enabledOverlayIds: Set<string>) => {
  const overlayId = overlayIdOf(useMapControlsStore.getState().mapOptions.paintBy);
  const name = overlayId && getOverlayName(overlayId);
  return name ? new Set([...enabledOverlayIds, name]) : enabledOverlayIds;
};

/** Boundary visibility from before a mask was armed, restored on release. */
interface LayersBeforeMask {
  enabledOverlayIds: Set<string>;
  showCountyBoundaries?: boolean;
  prominentCountyNames?: boolean;
}

export interface OverlayStore {
  _idCache: Map<string, boolean>;
  _layersBeforeMask: LayersBeforeMask | null;
  enabledOverlayIds: Set<string>;
  paintConstraint: OverlayPaintConstraint | null;
  selectingLayerId: string | null;
  /** The Mask tool's "Mask by" layer: clicking one of its areas sets the mask. */
  maskByLayerId: string | null;
  /** Choose the Mask tool's layer: shows only it (like arming a mask, and
   * releasing any current one), without arming the one-shot selection. */
  setMaskBy: (layerId: string) => void;
  toggleOverlay: (overlayId: string) => void;
  enableOverlay: (overlayId: string) => void;
  disableOverlay: (overlayId: string) => void;
  /** Show only this boundary layer (or just the county lines), plus the mask's
   * own layer while one is up; a pending mask's restore set follows suit. */
  showOnlyLayer: (overlayName: string | null, showCounties: boolean) => void;
  setPaintConstraint: (overlayId: string, featureId: string) => void;
  selectOverlayFeature: (overlayId: string) => void;
  clearPaintConstraint: () => void;
  reset: () => void;
}

export const useOverlayStore = create(
  subscribeWithSelector<OverlayStore>((set, get) => {
    /** Both ways of picking a mask (the Boundaries rows' one-shot selection and
     * the Mask tool's Mask by) show its layer the same way: only that layer
     * (plus the Paint by overlay) is drawn, its areas need to be there to
     * click, and other boundaries on top are clutter. The layers shown before
     * are kept, from the first arming, for release to restore. Showing a new
     * mask layer releases the current mask. */
    const showMaskLayer = (layerId: string) => {
      const {mapOptions, setMapOptions} = useMapControlsStore.getState();
      const layersBeforeMask = get()._layersBeforeMask ?? {
        enabledOverlayIds: get().enabledOverlayIds,
        showCountyBoundaries: mapOptions.showCountyBoundaries,
        prominentCountyNames: mapOptions.prominentCountyNames,
      };
      const isCounty = layerId === COUNTY_SOURCE_ID;
      const name = getOverlayName(layerId);
      setMapOptions({showCountyBoundaries: isCounty, prominentCountyNames: isCounty});
      set({
        paintConstraint: null,
        _idCache: new Map<string, boolean>(),
        enabledOverlayIds: withPaintByOverlay(new Set(name ? [name] : [])),
        _layersBeforeMask: layersBeforeMask,
      });
    };

    return {
      _idCache: new Map<string, boolean>(),
      _layersBeforeMask: null,
      enabledOverlayIds: new Set<string>(),
      paintConstraint: null,
      selectingLayerId: null,

      toggleOverlay: (overlayId: string) => {
        const {enabledOverlayIds, enableOverlay, disableOverlay} = get();
        if (enabledOverlayIds.has(overlayId)) {
          disableOverlay(overlayId);
        } else {
          enableOverlay(overlayId);
        }
      },

      enableOverlay: (overlayId: string) => {
        const {enabledOverlayIds} = get();
        const newEnabledIds = new Set(enabledOverlayIds);
        newEnabledIds.add(overlayId);
        set({enabledOverlayIds: newEnabledIds});
      },

      disableOverlay: (overlayId: string) => {
        const {paintConstraint, selectingLayerId, clearPaintConstraint} = get();
        // enabledOverlayIds holds overlay names, while the mask (or an armed
        // selection; arming releases any mask) holds an overlay_id. Release
        // first: that restores the pre-mask layers, minus this one below.
        const maskLayerId = paintConstraint?.overlayId ?? selectingLayerId;
        if (maskLayerId && getOverlayName(maskLayerId) === overlayId) {
          clearPaintConstraint();
        }
        const {enabledOverlayIds, _layersBeforeMask} = get();
        const newEnabledIds = new Set(enabledOverlayIds);
        newEnabledIds.delete(overlayId);
        set({enabledOverlayIds: newEnabledIds});
        // Hidden while another mask is up: keep it hidden after that one is released.
        if (_layersBeforeMask?.enabledOverlayIds.has(overlayId)) {
          const restoreIds = new Set(_layersBeforeMask.enabledOverlayIds);
          restoreIds.delete(overlayId);
          set({_layersBeforeMask: {..._layersBeforeMask, enabledOverlayIds: restoreIds}});
        }
        // Painting by this overlay needs its areas drawn; fall back to the map's units.
        const {mapOptions, setMapOptions} = useMapControlsStore.getState();
        const paintByOverlayId = overlayIdOf(mapOptions.paintBy);
        if (paintByOverlayId && getOverlayName(paintByOverlayId) === overlayId) {
          setMapOptions({paintBy: 'units'});
        }
      },

      showOnlyLayer: (overlayName, showCounties) => {
        const {paintConstraint, selectingLayerId, _layersBeforeMask} = get();
        const maskLayerId = paintConstraint?.overlayId ?? selectingLayerId;
        const maskIsCounty = maskLayerId === COUNTY_SOURCE_ID;
        const maskName = maskLayerId && !maskIsCounty ? getOverlayName(maskLayerId) : undefined;
        set({
          enabledOverlayIds: new Set([overlayName, maskName].filter((n): n is string => !!n)),
          // Releasing the mask then brings back only this layer, not the others.
          _layersBeforeMask: _layersBeforeMask && {
            enabledOverlayIds: new Set(overlayName ? [overlayName] : []),
            showCountyBoundaries: showCounties,
            prominentCountyNames: showCounties,
          },
        });
        const counties = showCounties || maskIsCounty;
        useMapControlsStore
          .getState()
          .setMapOptions({showCountyBoundaries: counties, prominentCountyNames: counties});
      },

      setPaintConstraint: (overlayId: string, featureId: string) => {
        const clearPaintConstraint = get().clearPaintConstraint;
        if (!overlayId || !featureId) {
          clearPaintConstraint();
          return;
        }
        const mapRef = useMapStore.getState().getMapRef();
        if (!mapRef) {
          clearPaintConstraint();
          return;
        }
        const matchingFeatures = queryAreaFeatures(mapRef, overlayId, featureId);
        if (matchingFeatures.length > 0) {
          // County brush and paint masks are mutually exclusive: county-brush
          // features carry no geometry, and the mask filter is geometric
          // (filterFeatures reads f.geometry). setPaintBy already clears the
          // mask when painting by county starts; this is the same exclusion from
          // the other direction, so neither order of clicks combines the two.
          const {mapOptions, setMapOptions} = useMapControlsStore.getState();
          if (mapOptions.paintBy === 'counties') setMapOptions({paintBy: 'units'});
          set({
            paintConstraint: {
              overlayId: overlayId,
              featureId: featureId,
              // Reference needs to be made into a new object since
              // this comes from a worker
              features: matchingFeatures.map(f => ({
                ...f,
                geometry: f.geometry,
              })) as MapGeoJSONFeature[],
            },
            _idCache: new Map<string, boolean>(),
            selectingLayerId: null,
          });
          return;
        } else {
          clearPaintConstraint();
        }
      },

      clearPaintConstraint: () => {
        const {_layersBeforeMask} = get();
        if (_layersBeforeMask) {
          const {enabledOverlayIds, ...countyOptions} = _layersBeforeMask;
          useMapControlsStore.getState().setMapOptions(countyOptions);
          set({enabledOverlayIds: withPaintByOverlay(enabledOverlayIds)});
        }
        set({
          paintConstraint: null,
          _idCache: new Map<string, boolean>(),
          selectingLayerId: null,
          _layersBeforeMask: null,
        });
      },

      selectOverlayFeature: overlayId => {
        showMaskLayer(overlayId);
        set({selectingLayerId: overlayId});
      },

      maskByLayerId: null,
      setMaskBy: layerId => {
        showMaskLayer(layerId);
        set({selectingLayerId: null, maskByLayerId: layerId});
      },

      reset: () => {
        set({
          _idCache: new Map<string, boolean>(),
          _layersBeforeMask: null,
          maskByLayerId: null,
          enabledOverlayIds: new Set<string>(),
          paintConstraint: null,
          selectingLayerId: null,
        });
      },
    };
  })
);
