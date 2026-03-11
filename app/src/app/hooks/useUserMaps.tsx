import {DocumentObject} from '../utils/api/apiHandlers/types';
import {useEffect, useState} from 'react';
import {idb} from '../utils/idb/idb';
import {useMapStore} from '../store/mapStore';

export const useUserMaps = (updateTrigger: string | null | number = null) => {
  const _updateTrigger = useMapStore(state => state.mapDocument);
  const [userMaps, setUserMaps] = useState<DocumentObject[]>([]);
  // Load recent maps from IndexedDB
  useEffect(() => {
    const loadRecentMaps = async () => {
      const storedDocs = await idb.getAllDocumentObjects();
      // Sort by clientLastUpdated descending (most recent first)
      const sortedDocs = storedDocs.sort((a, b) => {
        const aTime = new Date(a.updated_at || 0).getTime();
        const bTime = new Date(b.updated_at || 0).getTime();
        return bTime - aTime;
      });
      setUserMaps(sortedDocs);
    };
    loadRecentMaps();
  }, [_updateTrigger, updateTrigger]);
  return userMaps;
};
