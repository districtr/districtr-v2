import {create} from 'zustand';
import {MapStore, useMapStore} from './mapStore';
import {idb} from '../utils/idb/idb';
import {patchSharePlan} from '../utils/api/apiHandlers/patchSharePlan';
import {routeForType} from '@constants/document/routes';
import {ACCESS_STATES, type AccessState} from '@constants/document/state';

interface SaveShareStore {
  password: string;
  setPassword: (password: string) => void;
  generateLink: (editDocId?: string) => Promise<void>;
  updatePassword: (mapDocument: MapStore['mapDocument'], password: string) => Promise<void>;
  sharingMode: AccessState;
  setSharingMode: (sharingMode: AccessState) => void;
}

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
      return;
    }

    if (!documentId || !mapDocument) {
      setNotification({
        message: 'No document found while generating share link',
        importance: 2,
        type: 'error',
      });
      return;
    }
    const response = await patchSharePlan({
      document_id: documentId,
      password: password ?? null,
      access_type: sharingMode,
    });
    if (!response.ok) {
      setNotification({message: response.error.detail, importance: 2, type: 'error'});
      return;
    }
    const {public_id: publicId} = response.response;
    const routePrefix = routeForType(mapDocument.map_type);

    let shareableLink = new URL(`${window.location.origin}/${routePrefix}/${publicId}`);
    if (sharingMode === ACCESS_STATES.READ) {
      // Do nothing!
    } else if (sharingMode === ACCESS_STATES.EDIT && !password) {
      // Direct link to edit page
      shareableLink.pathname = `/${routePrefix}/edit/${documentId}`;
    } else {
      // Password protected link
      shareableLink.searchParams.set('pw', 'true');
    }

    navigator.clipboard.writeText(shareableLink.toString());
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
