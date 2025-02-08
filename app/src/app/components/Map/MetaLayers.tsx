import {getDissolved, ZONE_LABEL_STYLE} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {throttle} from 'lodash';
import {useState} from 'react';
import {useEffect} from 'react';
import {useCallback} from 'react';
import {Source, Layer} from 'react-map-gl/maplibre';

export const MetaLayers = () => {
  const showZoneNumbers = useMapStore(state => state.mapOptions.showZoneNumbers);
  const assignmentsHash = useMapStore(state => state.assignmentsHash);
  const [zoneNumberData, setZoneNumberData] = useState<any>([]);

  const addZoneMetaLayers = async () => {
    const zoneEntries = Array.from(useMapStore.getState().zoneAssignments.entries());
    await GeometryWorker?.updateProps(zoneEntries);
    const geoms = await getDissolved();
    console.log("!!!", geoms?.centroids)
    geoms && setZoneNumberData(geoms.centroids);
  };

  const throttleUpdateZoneMetaLayers = useCallback(
    throttle(addZoneMetaLayers, 1000, {
      leading: true,
      trailing: true,
    }),
    []
  );

  useEffect(() => {
    if (showZoneNumbers) {
      throttleUpdateZoneMetaLayers();
    }
  }, [showZoneNumbers, assignmentsHash]);

  return (
    <>
      {showZoneNumbers && (
        <Source id="zone-label" type="geojson" data={zoneNumberData}>
          <Layer
            id="ZONE_LABEL_BG"
            type="circle"
            source="ZONE_LABEL"
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
