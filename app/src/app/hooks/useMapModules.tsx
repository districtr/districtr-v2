import {getAvailableDistrictrMaps} from '../utils/api/apiHandlers/getAvailableDistrictrMaps';
import {DistrictrMap} from '../utils/api/apiHandlers/types';
import {useState} from 'react';
import {useEffect} from 'react';
import {useMapStore} from '../store/mapStore';

export const useMapModules = () => {
  const [mapModules, setMapModules] = useState<DistrictrMap[]>([]);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  useEffect(() => {
    const loadMapModules = async () => {
      const modules = await getAvailableDistrictrMaps({
        limit: 1000,
        offset: 0,
      });
      if (!modules.ok) {
        setErrorNotification({
          message: modules.error.detail,
          severity: 2,
          id: `load-map-modules-${modules.error.detail}`,
        });
        return;
      }
      setMapModules(modules.response);
    };
    loadMapModules();
  }, [setMapModules]);

  return mapModules;
};
