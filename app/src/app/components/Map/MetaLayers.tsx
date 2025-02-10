import {getDissolved, ZONE_LABEL_STYLE} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {useRef, useState} from 'react';
import {useEffect} from 'react';
import {Source, Layer} from 'react-map-gl/maplibre';

export const MetaLayers = () => {
  const showZoneNumbers = useMapStore(state => state.mapOptions.showZoneNumbers);
  const assignmentsHash = useMapStore(state => state.assignmentsHash);
  const mapDocumentId = useMapStore(state => state.mapDocument?.document_id);
  const getMapRef = useMapStore(state => state.getMapRef);
  const [zoneNumberData, setZoneNumberData] = useState<any>([]);
  const [dataDocumentId, setDataDocumentId] = useState<string | null>(null);
  const updateTimeout = useRef<ReturnType<typeof setTimeout>>();
  const showLayer = dataDocumentId === mapDocumentId;

  const addZoneMetaLayers = async () => {
    const showZoneNumbers = useMapStore.getState().mapOptions.showZoneNumbers;
    const id = `${mapDocumentId}`;
    if (showZoneNumbers) {
      const zoneEntries = Array.from(useMapStore.getState().zoneAssignments.entries());
      await GeometryWorker?.updateProps(zoneEntries);
      const geoms = await getDissolved();
      geoms && setZoneNumberData(geoms.centroids);
      setDataDocumentId(id);
    } else {
      setZoneNumberData([]);
    }
  };
  const handleUpdate = () => {
    updateTimeout.current && clearTimeout(updateTimeout.current);
    updateTimeout.current = setTimeout(() => {
      addZoneMetaLayers();
    }, 1000);
  }

  useEffect(handleUpdate, [showZoneNumbers, assignmentsHash]);

  useEffect(() => {
    const map = getMapRef();
    if (map) {
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

  return (
    <>
      {showZoneNumbers && (
        <Source id="zone-label" type="geojson" data={zoneNumberData}>
          <Layer
            id="ZONE_LABEL_BG"
            type="circle"
            source="ZONE_LABEL"
            layout={{
              visibility: showLayer ? 'visible' : 'none',
            }}
            paint={{
              'circle-color': '#fff',
              'circle-radius': 15,
              'circle-opacity': 0.8,
              'circle-stroke-color': ZONE_LABEL_STYLE || '#000',
              'circle-stroke-width': 2,
            }}
            filter={['==', ['get', 'zone'], ['get', 'zone']]}
          ></Layer>
          <Layer
            id="ZONE_LABEL"
            type="symbol"
            source="ZONE_LABEL"
            layout={{
              visibility: showLayer ? 'visible' : 'none',
              'text-field': ['get', 'zone'],
              'text-font': ['Barlow Bold'],
              'text-size': 18,
              'text-anchor': 'center',
              'text-offset': [0, 0],
            }}
            paint={{
              'text-color': '#000',
            }}
          ></Layer>
        </Source>
      )}
    </>
  );
};
