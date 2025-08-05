import {EMPTY_FT_COLLECTION, getDissolved, ZONE_LABEL_STYLE} from '@/app/constants/layers';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useMapStore} from '@/app/store/mapStore';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {DEFAULT_MAP_METADATA} from '@/app/utils/language';
import React, {useLayoutEffect, useRef, useState} from 'react';
import {useEffect} from 'react';
import {Source, Layer, Marker, MarkerDragEvent, Popup} from 'react-map-gl/maplibre';
import {Box} from '@radix-ui/themes';
import {Pin} from '../Topbar/Icons';
import {Offset} from 'maplibre-gl';
import {LocationComment} from '@/app/utils/api/apiHandlers/types';

export const MetaLayers: React.FC<{isDemographicMap?: boolean}> = ({isDemographicMap}) => {
  return (
    <>
      {!isDemographicMap && <ZoneNumbersLayer />}
      <PopulationTextLayer />
      <PinCommentsLayer />
    </>
  );
};

const PopulationTextLayer = () => {
  const captiveIds = useMapStore(state => state.captiveIds);
  const [pointFeatureCollection, setPointFeatureCollection] =
    useState<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_FT_COLLECTION);
  const showBlockPopulationNumbers = useMapStore(
    state => state.mapOptions.showBlockPopulationNumbers
  );
  const showPopulationNumbers = useMapStore(state => state.mapOptions.showPopulationNumbers);
  const workerUpdateHash = useMapStore(state => state.workerUpdateHash);
  const demographyHash = useDemographyStore(state => state.dataHash);

  useEffect(() => {
    const shouldShow =
      showPopulationNumbers ||
      showBlockPopulationNumbers ||
      (showBlockPopulationNumbers && captiveIds.size);
    if (!shouldShow) {
      setPointFeatureCollection(EMPTY_FT_COLLECTION);
      return;
    }

    const idSet: Set<string> = showPopulationNumbers
      ? new Set(demographyCache.table?.dedupe('path').column('path') ?? [])
      : captiveIds;

    const currIds = new Set(pointFeatureCollection.features.map(f => f.properties?.path));
    const missingIds = Array.from(idSet).filter(id => !currIds.has(id));
    if (!missingIds.length) {
      return;
    }
    GeometryWorker?.getCentroidsByIds(missingIds).then(data => {
      setPointFeatureCollection(prev => ({
        type: 'FeatureCollection',
        // Filter out old, irrelevant features (eg broken parents)
        features: [...prev.features.filter(f => idSet.has(f.properties?.path)), ...data.features],
      }));
    });
    // Trigger on captiveIds changes (shatter/break)
    // Option changes (showBlockPopulationNumbers, showPopulationNumbers)
    // Data loads to the worker (workerUpdateHash)
    // Demography data loads (demographyHash)
  }, [
    captiveIds,
    showBlockPopulationNumbers,
    showPopulationNumbers,
    workerUpdateHash,
    demographyHash,
  ]);

  if (
    !showPopulationNumbers &&
    (!showBlockPopulationNumbers || !pointFeatureCollection.features.length || !captiveIds.size)
  ) {
    return null;
  }

  return (
    <Source id="population-text" type="geojson" data={pointFeatureCollection}>
      <Layer
        id="POPULATION_TEXT"
        type="symbol"
        source="POPULATION_TEXT"
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
            14, // At zoom level 18, text size is 18
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
      ></Layer>
    </Source>
  );
};

const ZoneNumbersLayer = () => {
  const showZoneNumbers = useMapStore(state => state.mapOptions.showZoneNumbers);
  const showPaintedDistricts = useMapStore(state => state.mapOptions.showPaintedDistricts);
  const zoneAssignments = useMapStore(state => state.zoneAssignments);
  const colorScheme = useMapStore(state => state.colorScheme);
  const mapDocumentId = useMapStore(state => state.mapDocument?.document_id);
  const getMapRef = useMapStore(state => state.getMapRef);
  const lockedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const [zoneNumberData, setZoneNumberData] =
    useState<GeoJSON.FeatureCollection>(EMPTY_FT_COLLECTION);
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
      if (geoms && mapDocumentId === id) {
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

  useLayoutEffect(handleUpdate, [
    showZoneNumbers,
    zoneAssignments,
    mapRenderingState,
    appLoadingState,
  ]);

  useEffect(() => {
    const map = getMapRef();
    if (map) {
      map.loadImage('/lock.png').then(image => map.addImage('lock', image.data));
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
            10, // At zoom level 5, radius is 10 (increased from 8)
            10,
            15, // At zoom level 10, radius is 15 (increased from 12)
            15,
            18, // At zoom level 15 and above, radius is 18 (increased from 15)
          ],
          'circle-opacity': 0.8,
          'circle-stroke-color': ZONE_LABEL_STYLE(colorScheme) || '#000',
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            1.5, // At zoom level 5, stroke width is 1.5 (increased from 1)
            15,
            2.5, // At zoom level 15 and above, stroke width is 2.5 (increased from 2)
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
            12, // At zoom level 5, text size is 12 (increased from 10)
            10,
            16, // At zoom level 10, text size is 16 (increased from 14)
            15,
            20, // At zoom level 15 and above, text size is 20 (increased from 18)
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
            0.8, // At zoom level 5, icon size is 0.8 (increased from 0.6)
            10,
            1.0, // At zoom level 10, icon size is 1.0 (increased from 0.8)
            15,
            1.2, // At zoom level 15 and above, icon size is 1.2 (increased from 1)
          ],
          'icon-allow-overlap': true,
        }}
        filter={
          // get zone not in lockedAreas
          ['in', ['get', 'zone'], ['literal', lockedAreas]]
        }
      ></Layer>
    </Source>
  );
};

const PinCommentsLayer = () => {
  const mapMetadata = useMapMetadata();
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const [popupIndex, setPopupIndex] = useState<number | null>(null);
  const popupContent =
    popupIndex !== null && mapMetadata?.comments?.[popupIndex]?.type === 'location'
      ? (mapMetadata?.comments?.[popupIndex] as LocationComment)
      : null;

  const handleDrag = async (e: MarkerDragEvent, index: number) => {
    let comments = [...(mapMetadata?.comments || [])];
    comments[index] = {
      ...comments[index],
      lng: e.lngLat.lng,
      lat: e.lngLat.lat,
      type: 'location',
    };
    try {
      const r = await saveMap({
        ...(mapMetadata || DEFAULT_MAP_METADATA),
        comments,
      });
    } catch (e) {
      setErrorNotification({
        message: 'Error saving map metadata or comment.',
        severity: 3,
      });
      console.error(e);
    }
  };

  if (!mapMetadata?.comments?.filter(c => c.type === 'location')?.length) {
    return null;
  }

  return (
    <>
      {mapMetadata?.comments?.map((_comment, index) => {
        if (_comment.type === 'location') {
          const comment = _comment as LocationComment;
          return (
            <Marker
              key={index}
              longitude={comment.lng}
              latitude={comment.lat}
              anchor="center"
              draggable={true}
              onDragEnd={e => handleDrag(e, index)}
              onClick={() => {
                setPopupIndex(index);
              }}
            >
              <Pin size="size-8" />
            </Marker>
          );
        } else {
          return null;
        }
      })}
      {popupContent?.lng !== undefined && (
        <Popup
          anchor="bottom"
          offset={[0, -30] as Offset}
          longitude={popupContent.lng}
          latitude={popupContent.lat}
          closeOnMove={false}
          closeOnClick={false}
        >
          <Box className="flex flex-col gap-2 p-4 z-[999]">{popupContent.comment}</Box>
        </Popup>
      )}
    </>
  );
};
