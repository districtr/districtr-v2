import {create} from 'zustand';
import {MapStore, useMapStore} from './mapStore';
import {sharePlan} from '../utils/api/mutations/sharePlan';

interface SaveShareStore {
  password: string;
  setPassword: (password: string) => void;
  generateLink: () => Promise<void>;
  updatePassword: (mapDocument: MapStore['mapDocument'], password: string) => void;
  sharingMode: 'read' | 'edit';
  setSharingMode: (sharingMode: 'read' | 'edit') => void;
}

export const useSaveShareStore = create<SaveShareStore>((set, get) => ({
  password: '',
  setPassword: password => set({password}),
  generateLink: async () => {
    const {password, sharingMode} = get();
    const {upsertUserMap, setErrorNotification, mapDocument, isEditing} = useMapStore.getState();

    if (!isEditing) {
      return;
    }

    if (!mapDocument?.document_id) {
      setErrorNotification({message: 'No document found while generating share link', severity: 2});
      return;
    }
    const {public_id: publicId} = await sharePlan.mutate({
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharingMode,
    });

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
    upsertUserMap({
      documentId: mapDocument?.document_id,
      mapDocument: {
        ...mapDocument,
        password: password,
        public_id: publicId,
      },
    });
  },
  updatePassword: (mapDocument: MapStore['mapDocument'], password: string) => {
    const {upsertUserMap} = useMapStore.getState();
    if (!mapDocument?.document_id) {
      return;
    }
    upsertUserMap({
      documentId: mapDocument?.document_id,
      mapDocument: {
        ...mapDocument,
        password: password,
      },
    });
    sharePlan.mutate({
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: 'edit',
    });
  },
  sharingMode: 'read',
  setSharingMode: sharingMode => set({sharingMode}),
}));

useMapStore.subscribe(
  state => state.mapDocument,
  (mapDocument, previousMapDocument) => {
    if (mapDocument?.document_id === previousMapDocument?.document_id) {
      return;
    }
    const userMap = useMapStore
      .getState()
      .userMaps.find(map => map.document_id === mapDocument?.document_id);
    useSaveShareStore.getState().setPassword(userMap?.password || '');
    useSaveShareStore.getState().setSharingMode(userMap?.password ? 'edit' : 'read');
  }
);
