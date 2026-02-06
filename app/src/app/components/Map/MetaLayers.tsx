import {
  EMPTY_FT_COLLECTION,
  ZONE_LABEL_STYLE,
  SELECTION_POINTS_SOURCE_ID,
  SELECTION_POINTS_SOURCE_ID_CHILD,
} from '@/app/constants/layers';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import GeometryWorker from '@/app/utils/GeometryWorker';
import React, {useLayoutEffect, useMemo, useState} from 'react';
import {useEffect} from 'react';
import {Source, Layer} from 'react-map-gl/maplibre';
import { useColorScheme } from '@/app/hooks/useColorScheme';
import {throttle} from 'lodash';
import {FilterSpecification} from 'maplibre-gl';

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
      } else {
        // match captiveIds
        return ['match', ['get', 'path'], Array.from(captiveIds), true, false] as FilterSpecification;
      }
    } else {
      if (shatterIds.parents.size) {
        return ['!', ['match', ['get', 'path'], Array.from(shatterIds.parents), true, false]] as FilterSpecification;
      } else {
        return ['literal', false] as FilterSpecification;
      }
    }
  }, [child, !child && shatterIds, child && captiveIds]);

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
          10, // z 10 font 8
          8,
          12,
          12,
          14,
          14, 
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
        'text-halo-width': 2,
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
  const zoneComments = useMapStore(state => state.mapDocument?.zone_comments);
  
  // Get zones that have comments
  const zonesWithComments = useMemo(() => {
    const zones = new Set<number>();
    (zoneComments || []).forEach(c => zones.add(c.zone));
    return Array.from(zones);
  }, [zoneComments]);

  const addZoneMetaLayers = async (
  ) => {
    const showZoneNumbers = useMapControlsStore.getState().mapOptions.showZoneNumbers;
    const map = useMapStore.getState().getMapRef();
    if (!map) return;
    const currentView = map.getBounds();
    const bounds = [
      currentView.getWest(),
      currentView.getSouth(),
      currentView.getEast(),
      currentView.getNorth(),
    ] as [number, number, number, number];
    const id = `${mapDocumentId}`;
    const activeZones = demographyCache.populations.filter(p => p.total_pop_20 > 0).map(p => p.zone);
    const mapState = useMapStore.getState();
    const currentComments = mapState.mapDocument?.zone_comments || [];
    const zonesWithCommentSet = new Set(currentComments.map(c => c.zone));
    if (showZoneNumbers && GeometryWorker) {
      const geoms = await GeometryWorker.getCentroidsFromView({
        activeZones,
        bounds,
        strategy: 'median-point',
      });
      if (geoms && mapDocumentId === id) {
        // Add hasComments property to each feature
        const enrichedFeatures = geoms.centroids.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            hasComments: zonesWithCommentSet.has(feature.properties?.zone),
          },
        }));
        setZoneNumberData({
          ...geoms.centroids,
          features: enrichedFeatures,
        });
      }
    } else {
      setZoneNumberData(EMPTY_FT_COLLECTION);
    }
  };

  const handleUpdate = useMemo(
    () => throttle(addZoneMetaLayers, 250, {leading: true, trailing: true}),
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
    zonesWithComments,
  ]);

  useEffect(() => {
    const map = getMapRef();
    if (map && !map.hasImage('lock')) {
      map.loadImage('/lock.png').then(image => map.addImage('lock', image.data));
      map.on('moveend', handleUpdate);
      map.on('zoomend', handleUpdate);
      map.on('resize', handleUpdate);
      map.on('idle', handleUpdate);
    }
    return () => {
      handleUpdate.cancel();
      if (map) {
        map.off('moveend', handleUpdate);
        map.off('zoomend', handleUpdate);
        map.off('resize', handleUpdate);
        map.off('idle', handleUpdate);
      }
    };
  }, [getMapRef, handleUpdate]);

  useEffect(() => {
    setZoneNumberData(EMPTY_FT_COLLECTION);
  }, [mapDocumentId]);

  if (!showZoneNumbers || !showPaintedDistricts) {
    return null;
  }
  return (
    <Source id="zone-label" type="geojson" data={zoneNumberData}>
      <Layer
        id="ZONE_LABEL_BG"
        type="circle"
        source="zone-label"
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
        }}
        paint={{
          'circle-color': '#fff',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            10, 
            10,
            15, 
            15,
            18, 
          ],
          'circle-opacity': 0.8,
          'circle-stroke-color': ZONE_LABEL_STYLE(colorScheme) || '#000',
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            1.5, 
            15,
            2.5, 
          ],
        }}
      ></Layer>
      <Layer
        id="ZONE_LABEL"
        type="symbol"
        source="zone-label"
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
          'text-field': ['get', 'zone'],
          'text-font': ['Barlow Bold'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            12,
            10,
            16,
            15,
            20,
          ],
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
        id="ZONE_LOCK_LABE"
        type="symbol"
        source="zone-label"
        layout={{
          visibility: shouldHide ? 'none' : 'visible',
          'icon-image': 'lock',
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            0.8, 
            10,
            1.0, 
            15,
            1.2, 
          ],
          'icon-allow-overlap': true,
        }}
        filter={
          // get zone not in lockedAreas
          ['in', ['get', 'zone'], ['literal', lockedAreas]]
        }
      ></Layer>
      {/* Simple circle indicator for zones with comments */}
      <Layer
        id="ZONE_COMMENT_INDICATOR"
        type="circle"
        source="zone-label"
        paint={{
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            10 / 3,  // matches general zone icon size at low zoom
            10,
            10 / 3,  // matches at medium zoom
            15,
            15 / 3,  // matches at high zoom
          ],
          'circle-color': ZONE_LABEL_STYLE(colorScheme) || '#000',
          'circle-stroke-width' : 2,
          // offset
          'circle-stroke-color': '#fff', // white stroke for visibility
          'circle-opacity': 1,
          'circle-translate': 
          [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            ['literal', [7, -7]],
            10,
            ['literal', [9, -9]],
            15,
            ['literal', [11, -11]],
          ]
        }}
        layout={{
          visibility: shouldHide ? 'none' : 'visible'
        }}
        filter={['==', ['get', 'hasComments'], true]}
      />
    </Source>
  );
};
