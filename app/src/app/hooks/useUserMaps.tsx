import { DocumentObject } from '../utils/api/apiHandlers/types';
import { useEffect, useState } from 'react';
import { idb } from '../utils/idb/idb';
import { useMapStore } from '../store/mapStore';
import { MAP_TYPES } from '@constants/document/types';

export const useUserMaps = (updateTrigger: string | null | number = null) => {
  const _updateTrigger = useMapStore(state => state.mapDocument);
  const [communityMaps, setCommunityMaps] = useState<DocumentObject[]>([]);
  const [districtMaps, setDistrictMaps] = useState<DocumentObject[]>([]);
  const [loading, setLoading] = useState(true);
  // Load recent maps from IndexedDB
  useEffect(() => {
    const loadRecentMaps = async () => {
      setLoading(true);
      try {
        const storedDocs = await idb.getAllDocumentObjects();
        // Sort by clientLastUpdated descending (most recent first)

        const sortedDocs = storedDocs.sort((a, b) => {
          const aTime = new Date(a.updated_at || 0).getTime();
          const bTime = new Date(b.updated_at || 0).getTime();
          return bTime - aTime;
        });
        const coiMaps: DocumentObject[] = [];
        const districtMaps: DocumentObject[] = [];
        for (const doc of sortedDocs) {
          if (doc.map_type === MAP_TYPES.COMMUNITY) {
            coiMaps.push(doc);
          } else {
            districtMaps.push(doc);
          }
        }
        // Set once after the loop so deleting the last map clears the lists — an empty
        // sortedDocs skips the loop, which would otherwise leave stale arrays rendered.
        setCommunityMaps(coiMaps);
        setDistrictMaps(districtMaps);
      } finally {
        setLoading(false);
      }
    };
    loadRecentMaps();
  }, [_updateTrigger, updateTrigger]);
  return { communityMaps, districtMaps, loading };
};
