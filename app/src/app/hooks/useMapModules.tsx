import {getAvailableDistrictrMaps} from '../utils/api/apiHandlers/getAvailableDistrictrMaps';
import {DistrictrMap} from '../utils/api/apiHandlers/types';
import {useState} from 'react';
import {useEffect} from 'react';

export const useMapModules = () => {
  const [mapModules, setMapModules] = useState<DistrictrMap[]>([]);
  useEffect(() => {
    const loadMapModules = async () => {
      const modules = await getAvailableDistrictrMaps({
        limit: 1000,
        offset: 0,
      });
      setMapModules(modules);
    };
    loadMapModules();
  }, [setMapModules]);

  return mapModules;
};
