import {useEffect, useRef, useState} from 'react';
import {idb} from '../utils/idb/idb';
import {StoredDocument} from '../utils/idb/idb';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {useMapStore} from '../store/mapStore';

export const useIdbDocument = (document_id: string | null | undefined) => {
  const [documentFromIdb, setDocumentFromIdb] = useState<Omit<
    StoredDocument,
    'assignments'
  > | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clientLastUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const mapDocument = useMapStore(state => state.mapDocument);
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const main = async () => {
      if (!document_id) {
        setDocumentFromIdb(null);
      } else {
        const documentFromIdb = await idb.documents
          .where('id')
          .equals(document_id ?? '')
          .first();
        if (!documentFromIdb) {
          setDocumentFromIdb(null);
          return;
        }
        setDocumentFromIdb({
          document_metadata: documentFromIdb.document_metadata,
          clientLastUpdated: documentFromIdb.clientLastUpdated,
          id: documentFromIdb.id,
          password: documentFromIdb.password,
        });
      }
    };
    timeoutRef.current = setTimeout(() => {
      main();
    }, idb.DEBOUNCE_DELAY);
  }, [document_id, clientLastUpdated, mapDocument]);

  return documentFromIdb;
};
