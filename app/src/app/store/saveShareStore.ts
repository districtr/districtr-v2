import {create} from 'zustand';
import {useMapStore} from './mapStore';
import {sharePlan} from '../utils/api/mutations';

interface SaveShareStore {
  password: string;
  setPassword: (password: string) => void;
  generateLink: () => Promise<void>;
  sharingMode: 'read' | 'edit';
  setSharingMode: (sharingMode: 'read' | 'edit') => void;
}

export const useSaveShareStore = create<SaveShareStore>((set, get) => ({
  password: '',
  setPassword: password => set({password}),
  generateLink: async () => {
    const {password, sharingMode} = get();
    const {upsertUserMap, setErrorNotification, mapDocument} = useMapStore.getState();
    if (!mapDocument?.document_id) {
      setErrorNotification({message: 'No document found while', severity: 2});
      return;
    }
    const payload = {
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharingMode,
    };

    try {
      // get the share link
      const token = await sharePlan.mutate(payload);
      // copy to clipboard
      if (token !== undefined) {
        const shareableLink = `${window.location.origin}/map?share=${token.token}`;
        navigator.clipboard.writeText(shareableLink);

        if (password !== null && mapDocument?.document_id) {
          upsertUserMap({
            documentId: mapDocument?.document_id,
            mapDocument: {
              ...mapDocument,
              password: password,
            },
          });
        }
      }
    } catch (error) {
      console.error('Error creating share link: ', error);
      useMapStore
        .getState()
        .setErrorNotification({message: 'Error creating share link', severity: 2});
    }
  },
  sharingMode: 'read',
  setSharingMode: sharingMode => set({sharingMode}),
}));

useMapStore.subscribe(
  state => state.mapDocument,
  mapDocument => {
    const userMap = useMapStore
      .getState()
      .userMaps.find(map => map.document_id === mapDocument?.document_id);
    useSaveShareStore.getState().setPassword(userMap?.password || '');
    useSaveShareStore.getState().setSharingMode(userMap?.password ? 'edit' : 'read');
  }
);
