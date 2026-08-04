import {useEffect, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {isUUID} from '@/app/utils/metadata/isUUID';
import {idb} from '@/app/utils/idb/idb';

/**
 * The editable document UUID for the current map, or null if the user has no edit
 * access to it. A map is editable if we hold its UUID directly (edit route),
 * retained it this session (editableDocId), or have a local copy (looked up by
 * public_id).
 *
 * Shared by the view switcher (to route into edit) and the share modal (to decide
 * share-vs-make-a-copy) so "can I edit this map?" is answered the same way
 * everywhere — including when an editor is temporarily in the read-only
 * Display/Evaluate view, where the loaded document is anonymous + read-only.
 */
export function useEditableDocId(): string | null {
  const liveDocId = useMapStore(state => state.mapDocument?.document_id ?? null);
  const publicId = useMapStore(state => state.mapDocument?.public_id ?? null);
  const editableDocId = useMapControlsStore(state => state.editableDocId);
  const [localEditDocId, setLocalEditDocId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (publicId == null) {
      setLocalEditDocId(null);
      return;
    }
    idb.getEditableIdByPublicId(publicId).then(id => {
      if (!cancelled) setLocalEditDocId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  return (liveDocId && isUUID(liveDocId) ? liveDocId : null) ?? editableDocId ?? localEditDocId;
}
