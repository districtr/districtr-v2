import {create} from 'zustand';
import {MapStore, useMapStore} from './mapStore';
import {idb} from '../utils/idb/idb';
import {patchSharePlan} from '../utils/api/apiHandlers/patchSharePlan';
import {routeForType} from '@constants/document/routes';
import {editPath} from '../utils/map/editUrl';
import {ACCESS_STATES, type AccessState} from '@constants/document/state';

interface SaveShareStore {
  password: string;
  setPassword: (password: string) => void;
  /** Resolves true once a link is on the clipboard. */
  generateLink: (editDocId?: string) => Promise<boolean>;
  updatePassword: (mapDocument: MapStore['mapDocument'], password: string) => Promise<void>;
  sharingMode: AccessState;
  setSharingMode: (sharingMode: AccessState) => void;
}

/** On a 409 the plan already holds a different password (set from another
 * device). Drop the local copy so Copy link stops re-sending it and the
 * password field unlocks. */
const forgetRefusedPassword = (status: number | undefined, documentId: string) => {
  if (status !== 409) return;
  useSaveShareStore.setState({password: ''});
  idb.updatePassword(documentId, '');
};

export const useSaveShareStore = create<SaveShareStore>((set, get) => ({
  password: '',
  setPassword: password => set({password}),
  generateLink: async (editDocId?: string) => {
    const {password, sharingMode} = get();
    const {setNotification, mapDocument} = useMapStore.getState();
    // editDocId lets an editor share while temporarily in the read-only view, where
    // mapDocument is the anonymous public copy. Fall back to the loaded doc otherwise.
    const documentId = editDocId ?? mapDocument?.document_id;
    const canEdit = mapDocument?.access === ACCESS_STATES.EDIT || !!editDocId;

    if (!canEdit) {
      return false;
    }

    if (!documentId || !mapDocument) {
      setNotification({
        message: 'No document found while generating share link',
        importance: 2,
        type: 'error',
      });
      return false;
    }
    const response = await patchSharePlan({
      document_id: documentId,
      // Only editable links carry a password.
      password: sharingMode === ACCESS_STATES.EDIT ? password : null,
      access_type: sharingMode,
    });
    if (!response.ok) {
      forgetRefusedPassword(response.error.status, documentId);
      setNotification({message: response.error.detail, importance: 2, type: 'error'});
      return false;
    }
    const {public_id: publicId} = response.response;
    const routePrefix = routeForType(mapDocument.map_type);

    let shareableLink = new URL(`${window.location.origin}/${routePrefix}/${publicId}`);
    if (sharingMode === ACCESS_STATES.READ) {
      // Do nothing!
    } else if (sharingMode === ACCESS_STATES.EDIT && !password) {
      // Direct edit link carrying the private edit id — treat it like a password
      shareableLink = new URL(
        `${window.location.origin}${editPath(routePrefix, documentId, publicId)}`
      );
    } else {
      // Password protected link
      shareableLink.searchParams.set('pw', 'true');
    }

    navigator.clipboard.writeText(shareableLink.toString());
    return true;
  },
  updatePassword: async (mapDocument: MapStore['mapDocument'], password: string) => {
    if (!mapDocument?.document_id) {
      return;
    }
    const {setNotification} = useMapStore.getState();
    const response = await patchSharePlan({
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: ACCESS_STATES.EDIT,
    });
    if (response.ok) {
      set({password});
      idb.updatePassword(mapDocument?.document_id, password);
    } else {
      forgetRefusedPassword(response.error.status, mapDocument.document_id);
      setNotification({message: response.error.detail, importance: 2, type: 'error'});
    }
  },
  sharingMode: ACCESS_STATES.READ,
  setSharingMode: sharingMode => set({sharingMode}),
}));

useMapStore.subscribe(
  state => state.mapDocument,
  (mapDocument, previousMapDocument) => {
    if (
      !mapDocument?.document_id ||
      mapDocument?.document_id === previousMapDocument?.document_id
    ) {
      return;
    }
    // Reset share state for the newly-loaded document first, so a previous map's
    // password doesn't linger (Bug 3) when the new map has no local copy yet.
    // Override from the local copy below if we have one.
    const store = useSaveShareStore.getState();
    store.setPassword('');
    store.setSharingMode(ACCESS_STATES.READ);
    idb.getDocument(mapDocument.document_id).then(userMap => {
      if (!userMap) return;
      store.setPassword(userMap?.password || '');
      store.setSharingMode(
        userMap?.document_metadata.access === ACCESS_STATES.EDIT
          ? ACCESS_STATES.EDIT
          : ACCESS_STATES.READ
      );
    });
  }
);
