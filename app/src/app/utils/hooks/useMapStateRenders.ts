import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {MapFeatureInfo} from '@/app/constants/types';
import {useHoverStore} from '@/app/store/hoverFeatures';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import {useEffect, useRef} from 'react';
import {useMap} from 'react-map-gl/dist/esm/exports-maplibre';
import {getFeaturesInBbox, getFeatureUnderCursor} from '../helpers';
import {demographyCache} from '../demography/demographyCache';

export const useVtdZoneRenders = ({
  demographicMap
}: {
  demographicMap: boolean | undefined
}) => {
  const maps = useMap();
  const mapRef = maps?.current?.getMap();
  // FOCUS FEATURES
  const focusFeatures = useMapStore(state => state.focusFeatures);
  const previousFocusFeatures = useRef<MapFeatureInfo[]>([]);

  useEffect(() => {
    if (!mapRef) return;
    focusFeatures.forEach(feature => {
      mapRef.setFeatureState(feature, {focused: true});
    });
    previousFocusFeatures.current.forEach(feature => {
      if (!focusFeatures.find(f => f.id === feature.id)) {
        mapRef.setFeatureState(feature, {focused: false});
      }
    });
    previousFocusFeatures.current = focusFeatures;
  }, [focusFeatures, mapRef]);

  // HOVERED FEATURES
  const hoverFeatures = useHoverStore(state => state.hoverFeatures);
  const previousHoverFeatures = useRef<MapFeatureInfo[]>([]);
  useEffect(() => {
    if (!mapRef) return;
    previousHoverFeatures.current.forEach(feature => {
        mapRef.setFeatureState(feature, {hover: false});
    });
    hoverFeatures.forEach(feature => {
      mapRef.setFeatureState(feature, {hover: true});
    });
    previousHoverFeatures.current = hoverFeatures;
  }, [hoverFeatures, mapRef]);

  // SHATTER FEATURES
  const shatterIds = useMapStore(state => state.shatterIds);
  const highlightBrokenDistricts = useMapStore(state => state.mapOptions.highlightBrokenDistricts);
  const mapRenderingState = useMapStore(state => state.mapRenderingState);
  const appLoadingState = useMapStore(state => state.mapRenderingState);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapLock = useMapStore(state => state.setMapLock);
  const previousShatterIds = useRef<MapStore['shatterIds']>({
    parents: new Set(),
    children: new Set(),
  });

  useEffect(() => {
    if (!mapRef || mapRenderingState !== 'loaded' || appLoadingState !== 'loaded' || !mapDocument) {
      return;
    }
    // Hide broken parents on parent layer
    // Show broken children on child layer
    // remove zone from parents
    shatterIds.parents.forEach(id => {
      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer: mapDocument?.parent_layer,
        },
        {
          broken: true,
          zone: null,
          highlighted: highlightBrokenDistricts,
        }
      );
    });
    previousShatterIds.current.parents.forEach((parentId: string) => {
      if (!shatterIds.parents.has(parentId)) {
        mapRef.setFeatureState(
          {
            id: parentId,
            source: BLOCK_SOURCE_ID,
            sourceLayer: mapDocument.parent_layer,
          },
          {
            highlighted: false,
            broken: false,
          }
        );
      }
    });
    previousShatterIds.current = shatterIds;
    mapRef.once('render', () => {
      setMapLock(false);
      console.log(`Unlocked at`, performance.now());
    });
  }, [shatterIds, highlightBrokenDistricts]);

  // CURSOR
  const activeTool = useMapStore(state => state.activeTool);
  const mapOptions = useMapStore(state => state.mapOptions);
  const setPaintFunction = useMapStore(state => state.setPaintFunction);
  useEffect(() => {
    if (!mapRef) return;
    const defaultPaintFunction = mapOptions.paintByCounty
      ? getFeatureUnderCursor
      : getFeaturesInBbox;
    let cursor;
    switch (activeTool) {
      case 'pan':
        cursor = '';
        setPaintFunction(defaultPaintFunction);
        break;
      case 'brush':
        cursor = 'url(paintbrush.png) 12 12, pointer';
        setPaintFunction(defaultPaintFunction);
        break;
      case 'eraser':
        cursor = 'url(eraser.png) 16 16, pointer';
        setPaintFunction(defaultPaintFunction);
        break;
      case 'shatter':
        cursor = 'url(break.png) 12 12, pointer';
        setPaintFunction(getFeatureUnderCursor);
        break;
      case 'lock':
        cursor = 'url(lock.png) 12 12, pointer';
        setPaintFunction(getFeatureUnderCursor);
        break;
      default:
        cursor = '';
    }
    mapRef.getCanvas().style.cursor = cursor;
  }, [activeTool, mapOptions.paintByCounty, mapRef]);

  // ZONE COLOR
  const zoneAssignments = useMapStore(state => demographicMap ? null : state.zoneAssignments);
  const previousZoneAssignments = useRef<MapStore['zoneAssignments']>(new Map());
  const isTemporalAction = useMapStore(state => state.isTemporalAction);
  const previousLoadingState = useRef<MapStore['appLoadingState']>('loading');

  useEffect(() => {
    if (demographicMap || !zoneAssignments) return;
    if (isTemporalAction) {
      demographyCache.updatePopulations(zoneAssignments);
    }
    
    if (
      !mapRef || // map does not exist
      !mapDocument || // map document is not loaded
      (appLoadingState !== 'loaded' && !isTemporalAction) || // app was blurred, loading, or temporal state was mutatated
      mapRenderingState !== 'loaded' // map layers are not loaded
    ) {
      return;
    }
    
    const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    const featureStateChangesCache =
      mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.stateChanges;
    if (!featureStateCache) return;
    const isInitialRender =
      appLoadingState !== 'loaded' || previousLoadingState.current !== 'loaded';

    zoneAssignments.forEach((zone, id) => {
      if (!id) return;
      const isChild = shatterIds.children.has(id);
      const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
      if (!sourceLayer) return;
      const featureState = featureStateCache?.[sourceLayer]?.[id];
      const futureState = featureStateChangesCache?.[sourceLayer]?.[id];
      if (!isInitialRender && (featureState?.zone === zone || futureState?.zone === zone)) return;

      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {
          selected: true,
          zone,
        }
      );
    });

    previousZoneAssignments.current.forEach((zone, id) => {
      if (zoneAssignments.get(id)) return;
      const isChild = previousShatterIds.current?.children.has(id);
      const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
      if (!sourceLayer) return;
      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {
          selected: false,
          zone: null,
        }
      );
    });
    zoneAssignments.forEach((zone, id) => {
      if (!id) return;
      const isChild = shatterIds.children.has(id);
      const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
      if (!sourceLayer) return;
      const featureState = featureStateCache?.[sourceLayer]?.[id];
      const futureState = featureStateChangesCache?.[sourceLayer]?.[id];
      if (!isInitialRender && (featureState?.zone === zone || futureState?.zone === zone)) return;

      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {
          selected: true,
          zone,
        }
      );
    });

    previousZoneAssignments.current.forEach((zone, id) => {
      if (zoneAssignments.get(id)) return;
      const isChild = previousShatterIds.current?.children.has(id);
      const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
      if (!sourceLayer) return;
      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {
          selected: false,
          zone: null,
        }
      );
    });
  }, [zoneAssignments, appLoadingState, mapRenderingState, mapRef]);
};
