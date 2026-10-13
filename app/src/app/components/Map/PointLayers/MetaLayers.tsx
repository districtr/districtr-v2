import {EMPTY_FT_COLLECTION, ZONE_LABEL_STYLE} from '@/app/constants/map/layerStyle';
import {
  SELECTION_POINTS_SOURCE_ID,
  SELECTION_POINTS_SOURCE_ID_CHILD,
  ZONE_LABEL_SOURCE_ID,
  ZONE_LABEL_LAYER_IDS,
  MAP_LAYER_ANCHOR_IDS,
} from '@/app/constants/map/layerIds';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import GeometryWorker from '@/app/utils/GeometryWorker';
import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useEffect} from 'react';
import {Source, Layer} from 'react-map-gl/maplibre';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {throttle} from 'lodash';
import {FilterSpecification} from 'maplibre-gl';

const POPULATION_TEXT_LAYER_IDS = ['POPULATION_TEXT_PARENT', 'POPULATION_TEXT_CHILD'];
// ponytail: badge radius + stroke at max zoom; over-hides a few px when zoomed out.
const ZONE_BADGE_HALF_SIZE_PX = 21;

export const MetaLayers: React.FC<{isDemographicMap?: boolean}> = ({isDemographicMap}) => {
  return (
    <>
      {!isDemographicMap && <ZoneNumbersLayer />}
      <PopulationTextLayer />
      <PopulationTextLayer child />
    </>
  );
};

const PopulationTextLayer: React.FC<{child?: boolean}> = ({child = false}) => {
  const captiveIds = useMapStore(state => state.captiveIds);
  const shatterIds = useAssignmentsStore(state => state.shatterIds);
  const showBlockPopulationNumbers = useMapControlsStore(
    state => state.mapOptions.showBlockPopulationNumbers
  );
  const showPopulationNumbers = useMapControlsStore(
    state => state.mapOptions.showPopulationNumbers
  );

  // Create filter based on which population numbers to show
  const populationFilter = useMemo<FilterSpecification>(() => {
    if (child) {
      if (showPopulationNumbers) {
        return ['literal', true] as FilterSpecification;
      } else if (captiveIds.size) {
        // match captiveIds
        return [
          'match',
          ['get', 'path'],
          Array.from(captiveIds),
          true,
          false,
        ] as FilterSpecification;
      } else {
        // An empty label list would fail match-expression validation
        // ("Expected at least one branch label"), leaving the previous
        // filter stuck in place after exiting block view.
        return ['literal', false] as FilterSpecification;
      }
    } else {
      if (shatterIds.parents.size) {
        return [
          '!',
          ['match', ['get', 'path'], Array.from(shatterIds.parents), true, false],
        ] as FilterSpecification;
      } else {
        // No broken precincts: show labels on all whole units.
        return ['literal', true] as FilterSpecification;
      }
    }
  }, [child, showPopulationNumbers, !child && shatterIds, child && captiveIds]);

  // Use the shared source from PointSelectionLayer (parent layer)
  if (!child && !showPopulationNumbers) {
    return null;
  }
  if (child && !showPopulationNumbers && !showBlockPopulationNumbers) {
    return null;
  }

  return (
    <Layer
      id={POPULATION_TEXT_LAYER_IDS[child ? 1 : 0]}
      type="symbol"
      source={child ? SELECTION_POINTS_SOURCE_ID_CHILD : SELECTION_POINTS_SOURCE_ID}
      beforeId={MAP_LAYER_ANCHOR_IDS.reference}
      filter={populationFilter}
      layout={{
        'text-field': ['get', 'total_pop_20'],
        'text-font': ['Barlow Bold'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0,
          0,
          10, // readable as soon as the labels appear
          14,
          13,
          20,
          16, // keeps growing at block-level zooms
          28,
        ],
        'text-anchor': 'center',
        'text-offset': [0, 0],
        // padding
        'text-padding': 0,
        'text-allow-overlap': ['step', ['zoom'], false, 12, true],
      }}
      paint={{
        'text-color': '#000',
        'text-halo-color': '#fff',
        // Scales with the larger text so the numbers stay legible over color.
        'text-halo-width': 2.5,
        // Set by ZoneNumbersLayer for labels a district badge would sit on.
        'text-opacity': ['case', ['boolean', ['feature-state', 'underZoneLabel'], false], 0, 1],
      }}
    />
  );
};

const ZoneNumbersLayer = () => {
  const showZoneNumbers = useMapControlsStore(state => state.mapOptions.showZoneNumbers);
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const zoneAssignments = useAssignmentsStore(state => state.zoneAssignments);
  const colorScheme = useColorScheme();
  const mapDocumentId = useMapStore(state => state.mapDocument?.document_id);
  const getMapRef = useMapStore(state => state.getMapRef);
  const lockedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const [zoneNumberData, setZoneNumberData] =
    useState<GeoJSON.FeatureCollection>(EMPTY_FT_COLLECTION);
  const mapRenderingState = useMapStore(state => state.mapRenderingState);
  const appLoadingState = useMapStore(state => state.appLoadingState);
  const focusFeaturesLength = useMapStore(state => state.focusFeatures.length);
  const showBlockPopulationNumbers = useMapControlsStore(
    state => state.mapOptions.showBlockPopulationNumbers
  );
  const shouldHide = showBlockPopulationNumbers && focusFeaturesLength;
  const demogHash = useDemographyStore(state => state.dataHash);
  const zoneDescriptions = useMapStore(state => state.mapDocument?.document_comments);
  const getZonesWithDescriptions = useMapStore(state => state.getZonesWithDescriptions);

  // Get zones that have descriptions
  const zonesWithDescriptions = useMemo(() => {
    return getZonesWithDescriptions();
  }, [getZonesWithDescriptions, zoneDescriptions]);
  const lastLabelData = useRef('');
  const hiddenPopulationLabels = useRef(new Map<string, {source: string; id: string}>());

  // Population labels yield to district badges. MapLibre collision can't express
  // this (badges must always show; population labels overlap each other from z12),
  // so hide the ones under a badge via feature-state.
  const hidePopulationLabelsUnder = (badges: GeoJSON.Feature<GeoJSON.Point>[]) => {
    const map = useMapStore.getState().getMapRef();
    if (!map) return;
    const layers = POPULATION_TEXT_LAYER_IDS.filter(id => map.getLayer(id));
    const next = new Map<string, {source: string; id: string}>();
    if (layers.length) {
      const r = ZONE_BADGE_HALF_SIZE_PX;
      badges.forEach(badge => {
        const {x, y} = map.project(badge.geometry.coordinates as [number, number]);
        map
          .queryRenderedFeatures(
            [
              [x - r, y - r],
              [x + r, y + r],
            ],
            {layers}
          )
          .forEach(f => next.set(`${f.source}|${f.id}`, {source: f.source, id: String(f.id)}));
      });
    }
    // Diff, so an unchanged set triggers no repaint (and no idle -> update loop).
    hiddenPopulationLabels.current.forEach((target, key) => {
      if (!next.has(key)) map.removeFeatureState(target, 'underZoneLabel');
    });
    next.forEach((target, key) => {
      if (!hiddenPopulationLabels.current.has(key)) {
        map.setFeatureState(target, {underZoneLabel: true});
      }
    });
    hiddenPopulationLabels.current = next;
  };

  const addZoneMetaLayers = async () => {
    const {showZoneNumbers, showPaintedDistricts, showBlockPopulationNumbers} =
      useMapControlsStore.getState().mapOptions;
    const map = useMapStore.getState().getMapRef();
    if (!map) return;
    const currentView = map.getBounds();
    const bounds = [
      currentView.getWest(),
      currentView.getSouth(),
      currentView.getEast(),
      currentView.getNorth(),
    ] as [number, number, number, number];
    const activeZones = demographyService.populations
      .filter(p => p.total_pop_20 > 0)
      .map(p => p.zone);
    const mapState = useMapStore.getState();
    const zonesWithDescriptionSet = new Set(mapState.getZonesWithDescriptions());
    if (showZoneNumbers && GeometryWorker) {
      const geoms = await GeometryWorker.getCentroidsFromView({
        activeZones,
        bounds,
        strategy: 'median-point',
      });
      if (geoms) {
        // Add hasComments property to each feature (used by map layer filters)
        const enrichedFeatures = geoms.centroids.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            hasComments: zonesWithDescriptionSet.has(feature.properties?.zone),
          },
        }));
        // Skip unchanged data: a fresh object re-renders the map, whose idle
        // event would schedule another identical update.
        const key = JSON.stringify(enrichedFeatures);
        if (key !== lastLabelData.current) {
          lastLabelData.current = key;
          setZoneNumberData({
            ...geoms.centroids,
            features: enrichedFeatures,
          });
        }
        const badgesShown =
          showPaintedDistricts && !(showBlockPopulationNumbers && mapState.focusFeatures.length);
        hidePopulationLabelsUnder(badgesShown ? enrichedFeatures : []);
      }
    } else {
      lastLabelData.current = '';
      setZoneNumberData(EMPTY_FT_COLLECTION);
      hidePopulationLabelsUnder([]);
    }
  };

  const handleUpdate = useMemo(
    () => throttle(addZoneMetaLayers, 100, {leading: true, trailing: true}),
    [mapDocumentId]
  );

  useLayoutEffect(() => {
    handleUpdate();
  }, [
    showZoneNumbers,
    zoneAssignments,
    mapRenderingState,
    appLoadingState,
    demogHash,
    zonesWithDescriptions,
  ]);

  useEffect(() => {
    const map = getMapRef();
    if (map && !map.hasImage('lock')) {
      map.loadImage('/lock.png').then(image => {
        // Re-check before adding: loadImage is async, so another run of this effect
        // (or another layer) may have added 'lock' before this resolves, which would
        // otherwise throw "An image named 'lock' already exists".
        if (image?.data && !map.hasImage('lock')) {
          map.addImage('lock', image.data);
        }
      });
      // 'move' also fires for zooms and resizes; 'idle' catches late tile loads.
      map.on('move', handleUpdate);
      map.on('idle', handleUpdate);
    }
    return () => {
      handleUpdate.cancel();
      if (map) {
        map.off('move', handleUpdate);
        map.off('idle', handleUpdate);
      }
    };
  }, [getMapRef, handleUpdate]);

  useEffect(() => {
    lastLabelData.current = '';
    hiddenPopulationLabels.current.clear();
    setZoneNumberData(EMPTY_FT_COLLECTION);
  }, [mapDocumentId]);

  if (!showZoneNumbers || !showPaintedDistricts) {
    return null;
  }
  return (
    <Source id={ZONE_LABEL_SOURCE_ID} type="geojson" data={zoneNumberData}>
      <Layer
        id={ZONE_LABEL_LAYER_IDS.BACKGROUND}
        type="circle"
        source={ZONE_LABEL_SOURCE_ID}
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
        }}
        paint={{
          'circle-color': '#fff',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 15, 15, 18],
          'circle-opacity': 0.9,
          'circle-stroke-color': ZONE_LABEL_STYLE(colorScheme) || '#000',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 15, 2.5],
        }}
      ></Layer>
      <Layer
        id={ZONE_LABEL_LAYER_IDS.TEXT}
        type="symbol"
        source={ZONE_LABEL_SOURCE_ID}
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
          'text-field': ['get', 'zone'],
          'text-font': ['Barlow Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 12, 10, 16, 15, 20],
          'text-anchor': 'center',
          'text-offset': [0, 0],
          'text-allow-overlap': true,
        }}
        paint={{
          'text-color': '#000',
        }}
        filter={
          // get zone not in lockedAreas
          ['!', ['in', ['get', 'zone'], ['literal', lockedAreas]]]
        }
      ></Layer>
      <Layer
        id={ZONE_LABEL_LAYER_IDS.LOCK}
        type="symbol"
        source={ZONE_LABEL_SOURCE_ID}
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
          'icon-image': 'lock',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 1.0, 15, 1.2],
          'icon-allow-overlap': true,
        }}
        filter={
          // get zone not in lockedAreas
          ['in', ['get', 'zone'], ['literal', lockedAreas]]
        }
      ></Layer>
      {/* Simple circle indicator for zones with comments */}
      <Layer
        id={ZONE_LABEL_LAYER_IDS.COMMENT_INDICATOR}
        type="circle"
        source={ZONE_LABEL_SOURCE_ID}
        paint={{
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            10 / 3, // matches general zone icon size at low zoom
            10,
            10 / 3, // matches at medium zoom
            15,
            15 / 3, // matches at high zoom
          ],
          'circle-color': ZONE_LABEL_STYLE(colorScheme) || '#000',
          'circle-stroke-width': 2,
          // offset
          'circle-stroke-color': '#fff', // white stroke for visibility
          'circle-opacity': 1,
          'circle-translate': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            ['literal', [7, -7]],
            10,
            ['literal', [9, -9]],
            15,
            ['literal', [11, -11]],
          ],
        }}
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
        }}
        filter={['==', ['get', 'hasComments'], true]}
      />
    </Source>
  );
};
