import {getAvailableDistrictrMaps} from '../utils/api/apiHandlers/getAvailableDistrictrMaps';
import {DistrictrMap} from '../utils/api/apiHandlers/types';
import {useState} from 'react';
import {useEffect} from 'react';
import {useMapStore} from '../store/mapStore';

export const useMapModules = () => {
  const [mapModules, setMapModules] = useState<DistrictrMap[]>([]);
  const setNotification = useMapStore(state => state.setNotification);
  useEffect(() => {
    const loadMapModules = async () => {
      const modules = await getAvailableDistrictrMaps({
        limit: 1000,
        offset: 0,
      });
      if (!modules.ok) {
        setNotification({
          message: modules.error.detail,
          importance: 2,
          type: 'error',
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
