import {EMPTY_FT_COLLECTION, ZONE_LABEL_STYLE} from '@/app/constants/map/layerStyle';
import {
  CANONICAL_LAYER_IDS,
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
import {useToolbarStore} from '@/app/store/toolbarStore';
import {ACCESS_STATES} from '@constants/document/state';
import {demographyService} from '@/app/utils/demography/demographyService';
import GeometryWorker from '@/app/utils/GeometryWorker';
import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useEffect} from 'react';
import {Source, Layer} from 'react-map-gl/maplibre';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {throttle} from 'lodash';
import {FilterSpecification} from 'maplibre-gl';

// Basemap place-name source layers: protomaps (minimal/streets) and MapTiler (satellite).
const PLACE_LABEL_SOURCE_LAYERS = new Set([
  'places',
  'place_label',
  'town_label',
  'city_label',
  'state_label',
  'country_label',
  'country_disputed_label',
  'continent_label',
]);

/**
 * Population numbers yield to every 'never' label placed before them (that is how
 * they yield to district badges), and basemap place names are placed first. While
 * the numbers are on, tuning is fine-grained, so hide place names instead.
 * Re-applied on 'style.load', since a basemap switch brings them back.
 */
const useHidePlaceLabels = (hide: boolean) => {
  const getMapRef = useMapStore(state => state.getMapRef);
  useEffect(() => {
    const map = getMapRef();
    if (!map || !hide) return;
    let hidden: string[] = [];
    const apply = () => {
      // Skip layers the style itself hides, so restoring doesn't reveal them.
      hidden = (map.getStyle()?.layers ?? [])
        .filter(
          l =>
            l.type === 'symbol' &&
            PLACE_LABEL_SOURCE_LAYERS.has(l['source-layer'] ?? '') &&
            l.layout?.visibility !== 'none'
        )
        .map(l => l.id);
      hidden.forEach(id => map.setLayoutProperty(id, 'visibility', 'none'));
    };
    apply();
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
      hidden.forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'visible'));
    };
  }, [hide, getMapRef]);
};

export const MetaLayers: React.FC<{isDemographicMap?: boolean}> = ({isDemographicMap}) => {
  const showPopulationNumbers = useMapControlsStore(
    state => state.mapOptions.showPopulationNumbers
  );
  const showBlockPopulationNumbers = useMapControlsStore(
    state => state.mapOptions.showBlockPopulationNumbers
  );
  const hasCaptiveBlocks = useMapStore(state => state.captiveIds.size > 0);
  // Same condition under which PopulationTextLayer renders any numbers.
  useHidePlaceLabels(!!(showPopulationNumbers || (showBlockPopulationNumbers && hasCaptiveBlocks)));
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
      id={`POPULATION_TEXT_${child ? 'CHILD' : 'PARENT'}`}
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
        // From z12 labels may overlap each other ('cooperative') but still yield to
        // 'never' symbols placed before them: the district badge collider (and basemap
        // place names, which useHidePlaceLabels hides while these numbers show).
        'text-overlap': ['step', ['zoom'], 'never', 12, 'cooperative'],
      }}
      paint={{
        'text-color': '#000',
        'text-halo-color': '#fff',
        // Scales with the larger text so the numbers stay legible over color.
        'text-halo-width': 2.5,
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
  // View, Evaluate, and plain Draw keep the locks for the trip back to Super Draw,
  // but don't apply them, so their labels show plain district numbers.
  const canEdit = useMapStore(state => state.mapDocument?.access === ACCESS_STATES.EDIT);
  const superDraw = useToolbarStore(state => state.superDraw);
  const editLocks = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const lockedAreas = canEdit && superDraw ? editLocks : [];
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
  const addZoneMetaLayers = async () => {
    const showZoneNumbers = useMapControlsStore.getState().mapOptions.showZoneNumbers;
    const map = useMapStore.getState().getMapRef();
    // No label work mid-motion or mid-stroke (the camera is still while painting):
    // a re-place forces MapLibre to re-place every symbol. The 'moveend' after a
    // motion, or the assignment change / 'idle' after a stroke, picks it up.
    if (!map || map.isMoving() || useMapControlsStore.getState().isPainting) return;
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
      }
    } else {
      lastLabelData.current = '';
      setZoneNumberData(EMPTY_FT_COLLECTION);
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
    }
    // Not behind hasImage: when the document lands after the map (mapDocumentId
    // changes, so handleUpdate is rebuilt) the cleanup detaches these and 'lock'
    // already exists, which used to leave labels frozen until a refresh.
    if (map) {
      // 'moveend' covers pans, zooms and resizes without waiting on tiles; 'idle' is
      // a backstop (e.g. point data landing after load) and a no-op when unchanged.
      map.on('moveend', handleUpdate);
      map.on('idle', handleUpdate);
    }
    return () => {
      handleUpdate.cancel();
      if (map) {
        map.off('moveend', handleUpdate);
        map.off('idle', handleUpdate);
      }
    };
  }, [getMapRef, handleUpdate]);

  useEffect(() => {
    lastLabelData.current = '';
    setZoneNumberData(EMPTY_FT_COLLECTION);
  }, [mapDocumentId]);

  if (!showZoneNumbers || !showPaintedDistricts) {
    return null;
  }
  return (
    <Source id={ZONE_LABEL_SOURCE_ID} type="geojson" data={zoneNumberData}>
      {/* Invisible, badge-sized collision box. Rendered first so it exists when the
          badge layers below anchor to it (beforeId), keeping it topmost: MapLibre
          places it first with 'never', so population labels ('never' / 'cooperative')
          yield to it; the visible badge layers stay 'always' so crowded districts all
          keep a number. */}
      <Layer
        id={CANONICAL_LAYER_IDS.ZONE_LABELS.COLLIDER}
        type="symbol"
        source={ZONE_LABEL_SOURCE_ID}
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
          'text-field': ['to-string', ['get', 'zone']],
          'text-font': ['Barlow Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 12, 10, 16, 15, 20],
          // ponytail: estimated as badge radius minus half a 2-digit box, not measured;
          // 1-digit badges reserve a few px less horizontally. Raise if labels peek out.
          'text-padding': ['interpolate', ['linear'], ['zoom'], 5, 5, 10, 8, 15, 10],
          'text-overlap': 'never',
        }}
        paint={{'text-opacity': 0}}
      />
      <Layer
        id={ZONE_LABEL_LAYER_IDS.BACKGROUND}
        beforeId={CANONICAL_LAYER_IDS.ZONE_LABELS.COLLIDER}
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
        beforeId={CANONICAL_LAYER_IDS.ZONE_LABELS.COLLIDER}
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
        beforeId={CANONICAL_LAYER_IDS.ZONE_LABELS.COLLIDER}
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
        beforeId={CANONICAL_LAYER_IDS.ZONE_LABELS.COLLIDER}
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
