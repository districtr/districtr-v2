import {useEffect, useRef, useState} from 'react';
import {idb} from '../utils/idb/idb';
import {StoredDocument} from '../utils/idb/idb';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../store/coiAssignmentsStore';
import {useMapStore} from '../store/mapStore';

export const useIdbDocument = (document_id: string | null | undefined) => {
  const [documentFromIdb, setDocumentFromIdb] = useState<Omit<
    StoredDocument,
    'assignments'
  > | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const districtClientLastUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const coiClientLastUpdated = useCoiAssignmentsStore(state => state.clientLastUpdated);
  const mapDocument = useMapStore(state => state.mapDocument);
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    let cancelled = false;
    const main = async () => {
      if (!document_id) {
        if (!cancelled) setDocumentFromIdb(null);
      } else {
        const documentFromIdb = await idb.documents
          .where('id')
          .equals(document_id ?? '')
          .first();
        if (cancelled) return;
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
    return () => {
      // Covers the component-unmount-during-debounce case: cancel the pending
      // setTimeout AND the in-flight IDB read so we don't setState on an
      // unmounted component.
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [document_id, districtClientLastUpdated, coiClientLastUpdated, mapDocument]);

  return documentFromIdb;
};
