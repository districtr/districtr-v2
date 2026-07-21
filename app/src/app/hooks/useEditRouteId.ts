import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useMapStore} from '@/app/store/mapStore';
import {isUUID} from '@/app/utils/metadata/isUUID';
import {idb} from '@/app/utils/idb/idb';

/**
 * Keeps the editable UUID out of the address bar on edit routes.
 *
 * The UUID is a capability: anyone who has it can edit the map, so it should only
 * ever appear in the explicit "treat this link like a password" share link. This
 * hook makes edit routes work with the public id instead:
 *
 * - `/…/edit/{public_id}`: resolves the UUID from the local (IndexedDB) copy and
 *   returns it for document loading. If the user has no local copy, they have no
 *   edit access — redirect to the read-only view with the password prompt open.
 * - `/…/edit/{uuid}` (the secret share link, or any internal navigation that
 *   pushed a UUID): once the document loads, replaces the URL with the public id.
 *
 * Returns the id to load the document with, or null while a lookup is pending.
 */
export function useEditRouteId(
  mapId: string,
  isEditing: boolean,
  routePrefix: 'map' | 'coi'
): string | null {
  const router = useRouter();
  const needsLookup = isEditing && !!mapId && !isUUID(mapId);
  const [resolvedId, setResolvedId] = useState<string | null>(needsLookup ? null : mapId);

  useEffect(() => {
    if (!needsLookup) {
      setResolvedId(mapId);
      return;
    }
    let cancelled = false;
    idb.getEditableIdByPublicId(Number(mapId)).then(uuid => {
      if (cancelled) return;
      if (uuid) {
        setResolvedId(uuid);
      } else {
        // No local copy → no edit access. Password unlock (or view-only) instead.
        router.replace(`/${routePrefix}/${mapId}?pw=true`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapId, needsLookup, routePrefix, router]);

  // Once the document is loaded on a UUID edit URL, swap the UUID in the address
  // bar for the public id. replaceState (not router.replace) so the app doesn't
  // remount and reload the document.
  const publicId = useMapStore(state => state.mapDocument?.public_id);
  const docId = useMapStore(state => state.mapDocument?.document_id);
  useEffect(() => {
    if (!isEditing || !publicId || !docId || !isUUID(docId)) return;
    const {pathname, search, hash} = window.location;
    if (pathname.endsWith(`/edit/${docId}`)) {
      window.history.replaceState(
        null,
        '',
        pathname.replace(docId, String(publicId)) + search + hash
      );
    }
  }, [isEditing, publicId, docId]);

  return resolvedId;
}
