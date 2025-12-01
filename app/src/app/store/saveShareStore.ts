import {create} from 'zustand';
import {MapStore, useMapStore} from './mapStore';
import { idb } from '../utils/idb/idb';
import { patchSharePlan } from '../utils/api/apiHandlers/patchSharePlan';

interface SaveShareStore {
  password: string;
  setPassword: (password: string) => void;
  generateLink: () => Promise<void>;
  updatePassword: (mapDocument: MapStore['mapDocument'], password: string) => Promise<void>;
  sharingMode: 'read' | 'edit';
  setSharingMode: (sharingMode: 'read' | 'edit') => void;
}

export const useSaveShareStore = create<SaveShareStore>((set, get) => ({
  password: '',
  setPassword: password => set({password}),
  generateLink: async () => {
    const {password, sharingMode} = get();
    const {setErrorNotification, mapDocument} = useMapStore.getState();
    const isEditing = mapDocument?.access === 'edit';

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

    let shareableLink = new URL(`${window.location.origin}/map/${publicId}`);
    if (sharingMode === 'read') {
      // Do nothing!
    } else if (sharingMode === 'edit' && password === null) {
      // Direct link to edit page
      shareableLink.pathname = `/map/edit/${mapDocument.document_id}`;
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
      access_type: 'edit',
    })
    if (response.ok) {
      set({password});
      idb.updatePassword(mapDocument?.document_id, password);
    } else {
      setErrorNotification({message: response.error.detail, severity: 2});
    }
  },
  sharingMode: 'read',
  setSharingMode: sharingMode => set({sharingMode}),
}));

useMapStore.subscribe(
  state => state.mapDocument,
  (mapDocument, previousMapDocument) => {
    if (!mapDocument?.document_id || mapDocument?.document_id === previousMapDocument?.document_id) {
      return;
    }
    idb.getDocument(mapDocument?.document_id)
      .then(userMap => {
        if (!userMap) return;
        useSaveShareStore.getState().setPassword(userMap?.document_metadata.password || '');
        useSaveShareStore.getState().setSharingMode(userMap?.document_metadata.access === 'edit' ? 'edit' : 'read');
      })
  }
);
