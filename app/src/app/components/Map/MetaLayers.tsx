import {EMPTY_FT_COLLECTION, getDissolved, ZONE_LABEL_STYLE} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import React, {useLayoutEffect, useRef, useState} from 'react';
import {useEffect} from 'react';
import {Source, Layer} from 'react-map-gl/maplibre';

export const MetaLayers: React.FC<{isDemographicMap?:boolean}> = ({
  isDemographicMap
}) => {
  return (
    <>
      {!isDemographicMap && <ZoneNumbersLayer />}
      <PopulationTextLayer />
    </>
  );
};

const PopulationTextLayer = () => {
  const captiveIds = useMapStore(state => state.captiveIds);
  const [pointFeatureCollection, setPointFeatureCollection] = useState<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_FT_COLLECTION);
  const showBlockPopulationNumbers = useMapStore(state => state.mapOptions.showBlockPopulationNumbers);

  useEffect(() => {
    if (captiveIds.size === 0) {
      setPointFeatureCollection(EMPTY_FT_COLLECTION);
      return;
    }
    if (showBlockPopulationNumbers) {
      GeometryWorker?.getPropertiesCentroids(Array.from(captiveIds)).then(setPointFeatureCollection);
    }
  }, [captiveIds, showBlockPopulationNumbers])

  if (!showBlockPopulationNumbers || !pointFeatureCollection.features.length || !captiveIds.size) {
    return null
  }

  return (
    <Source id="population-text" type="geojson" data={pointFeatureCollection}>
      <Layer
        id="POPULATION_TEXT"
        type="symbol"
        source="POPULATION_TEXT"
        layout={{
          'text-field': ['get', 'total_pop'],
          'text-font': ['Barlow Bold'],
          'text-size': 18,
          'text-anchor': 'center',
          'text-offset': [0, 0],
        }}
        paint={{
          'text-color': '#000',
          'text-halo-color': '#fff',
          'text-halo-width': 2,
        }}
      ></Layer>
    </Source>
  );
}

const ZoneNumbersLayer = () => {
  const showZoneNumbers = useMapStore(state => state.mapOptions.showZoneNumbers);
  const zoneAssignments = useMapStore(state => state.zoneAssignments);
  const colorScheme = useMapStore(state => state.colorScheme);
  const mapDocumentId = useMapStore(state => state.mapDocument?.document_id);
  const getMapRef = useMapStore(state => state.getMapRef);
  const lockedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const [zoneNumberData, setZoneNumberData] = useState<GeoJSON.FeatureCollection>(EMPTY_FT_COLLECTION);
  const updateTimeout = useRef<ReturnType<typeof setTimeout> | null>();
  const mapRenderingState = useMapStore(state => state.mapRenderingState);
  const appLoadingState = useMapStore(state => state.appLoadingState);
  const shouldHide = useMapStore(
    state => state.mapOptions.showBlockPopulationNumbers && state.focusFeatures.length
  );

  const addZoneMetaLayers = async () => {
    const showZoneNumbers = useMapStore.getState().mapOptions.showZoneNumbers;
    const id = `${mapDocumentId}`;
    if (showZoneNumbers) {
      const geoms = await getDissolved();
      if (geoms && mapDocumentId === id){
        setZoneNumberData(geoms.centroids);
      }
    } else {
      setZoneNumberData(EMPTY_FT_COLLECTION);
    }
  };

  const handleUpdate = () => {
    if (!updateTimeout.current) {
      addZoneMetaLayers();
      updateTimeout.current = setTimeout(() => {
        updateTimeout.current = null;
      }, 100);
    }
  };

  useLayoutEffect(handleUpdate, [showZoneNumbers, zoneAssignments, mapRenderingState, appLoadingState]);

  useEffect(() => {
    const map = getMapRef();
    if (map) {
      map.loadImage('/lock.png')
        .then(image => map.addImage('lock', image.data));
      map.on('moveend', handleUpdate);
      map.on('zoomend', handleUpdate);
    }
    return () => {
      if (map) {
        map.off('moveend', handleUpdate);
        map.off('zoomend', handleUpdate);
      }
    };
  }, [getMapRef]);

  useEffect(() => {
    setZoneNumberData(EMPTY_FT_COLLECTION);
  }, [mapDocumentId])

  if (!showZoneNumbers) {
    return null
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
          'circle-radius': 15,
          'circle-opacity': 0.8,
          'circle-stroke-color': ZONE_LABEL_STYLE(colorScheme) || '#000',
          'circle-stroke-width': 2,
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
          'text-size': 18,
          'text-anchor': 'center',
          'text-offset': [0, 0],
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
          'icon-size': 1
        }}
        filter={
          // get zone not in lockedAreas
          ['in', ['get', 'zone'], ['literal', lockedAreas]]
        }
      ></Layer>
    </Source>
  );
};
