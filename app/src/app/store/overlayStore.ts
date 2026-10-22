'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {Overlay} from '@utils/api/apiHandlers/types';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {dissolve} from '@turf/turf';
import {Feature, MapGeoJSONFeature} from 'maplibre-gl';
import {COUNTY_SOURCE_ID} from '@constants/map/layerIds';

const COUNTY_SOURCE_LAYER = 'tl_2023_us_county';

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

export interface OverlayStore {
  _idCache: Map<string, boolean>;
  enabledOverlayIds: Set<string>;
  paintConstraint: OverlayPaintConstraint | null;
  selectingLayerId: string | null;
  toggleOverlay: (overlayId: string) => void;
  enableOverlay: (overlayId: string) => void;
  disableOverlay: (overlayId: string) => void;
  setPaintConstraint: (overlayId: string, featureId: string) => void;
  selectOverlayFeature: (overlayId: string) => void;
  clearPaintConstraint: () => void;
  reset: () => void;
}

export const useOverlayStore = create(
  subscribeWithSelector<OverlayStore>((set, get) => ({
    _idCache: new Map<string, boolean>(),
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
      const {enabledOverlayIds, paintConstraint, selectingLayerId, clearPaintConstraint} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      newEnabledIds.delete(overlayId);
      set({enabledOverlayIds: newEnabledIds});
      // enabledOverlayIds holds overlay names, while the mask and an armed
      // selection hold an overlay_id: release whichever belongs to this overlay.
      if (paintConstraint && getOverlayName(paintConstraint.overlayId) === overlayId) {
        clearPaintConstraint();
      } else if (selectingLayerId && getOverlayName(selectingLayerId) === overlayId) {
        set({selectingLayerId: null});
      }
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
      // query source layer for feature id; the built-in county layer is a
      // pseudo-overlay with its own source and source-layer
      const sourceFeatures =
        overlayId === COUNTY_SOURCE_ID
          ? mapRef?.querySourceFeatures(COUNTY_SOURCE_ID, {
              sourceLayer: COUNTY_SOURCE_LAYER,
              filter: ['==', ['get', 'GEOID'], featureId],
            })
          : mapRef?.querySourceFeatures(`overlay-source-${overlayId}`);
      const matchingFeatures = sourceFeatures?.filter((feature: any) => feature.id === featureId);
      if (matchingFeatures && matchingFeatures.length > 0) {
        // County brush and paint masks are mutually exclusive: county-brush
        // features carry no geometry, and the mask filter is geometric
        // (filterFeatures reads f.geometry). PaintByCounty already clears the
        // mask when the brush turns on; this is the same exclusion from the
        // other direction, so neither order of clicks combines the two.
        const {mapOptions, setMapOptions, setPaintFunction} = useMapControlsStore.getState();
        if (mapOptions.paintByCounty) {
          setMapOptions({paintByCounty: false});
          setPaintFunction(getFeaturesInBbox);
        }
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
      set({
        paintConstraint: null,
        _idCache: new Map<string, boolean>(),
        selectingLayerId: null,
      });
    },

    selectOverlayFeature: overlayId => {
      // Show only the layer being masked to: its areas need to be there to
      // click, and other boundaries drawn on top of it are just clutter.
      // Arming a new mask also releases the current one.
      const isCounty = overlayId === COUNTY_SOURCE_ID;
      const name = getOverlayName(overlayId);
      useMapControlsStore
        .getState()
        .setMapOptions({showCountyBoundaries: isCounty, prominentCountyNames: isCounty});
      get().clearPaintConstraint();
      set({selectingLayerId: overlayId, enabledOverlayIds: new Set(name ? [name] : [])});
    },

    reset: () => {
      set({
        _idCache: new Map<string, boolean>(),
        enabledOverlayIds: new Set<string>(),
        paintConstraint: null,
        selectingLayerId: null,
      });
    },
  }))
);
