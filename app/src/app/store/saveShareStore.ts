import {create} from 'zustand';
import {MapStore, useMapStore} from './mapStore';
import {idb} from '../utils/idb/idb';
import {patchSharePlan} from '../utils/api/apiHandlers/patchSharePlan';
import {routeForType} from '@constants/document/routes';
import {ACCESS_STATES, type AccessState} from '@constants/document/state';

interface SaveShareStore {
  password: string;
  setPassword: (password: string) => void;
  generateLink: () => Promise<void>;
  updatePassword: (mapDocument: MapStore['mapDocument'], password: string) => Promise<void>;
  sharingMode: AccessState;
  setSharingMode: (sharingMode: AccessState) => void;
}

export const useSaveShareStore = create<SaveShareStore>((set, get) => ({
  password: '',
  setPassword: password => set({password}),
  generateLink: async () => {
    const {password, sharingMode} = get();
    const {setErrorNotification, mapDocument} = useMapStore.getState();
    const isEditing = mapDocument?.access === ACCESS_STATES.EDIT;

    if (!isEditing) {
      return;
    }

    if (!mapDocument?.document_id) {
      setErrorNotification({message: 'No document found while generating share link', severity: 2});
      return;
    }
    const response = await patchSharePlan({
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharingMode,
    });
    if (!response.ok) {
      setErrorNotification({message: response.error.detail, severity: 2});
      return;
    }
    const {public_id: publicId} = response.response;
    const routePrefix = routeForType(mapDocument.map_type);

    let shareableLink = new URL(`${window.location.origin}/${routePrefix}/${publicId}`);
    if (sharingMode === ACCESS_STATES.READ) {
      // Do nothing!
    } else if (sharingMode === ACCESS_STATES.EDIT && !password) {
      // Direct link to edit page
      shareableLink.pathname = `/${routePrefix}/edit/${mapDocument.document_id}`;
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
    const {setErrorNotification} = useMapStore.getState();
    const response = await patchSharePlan({
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: ACCESS_STATES.EDIT,
    });
    if (response.ok) {
      set({password});
      idb.updatePassword(mapDocument?.document_id, password);
    } else {
      setErrorNotification({message: response.error.detail, severity: 2});
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
    idb.getDocument(mapDocument?.document_id).then(userMap => {
      if (!userMap) return;
      useSaveShareStore.getState().setPassword(userMap?.password || '');
      useSaveShareStore
        .getState()
        .setSharingMode(
          userMap?.document_metadata.access === ACCESS_STATES.EDIT
            ? ACCESS_STATES.EDIT
            : ACCESS_STATES.READ
        );
    });
  }
);
