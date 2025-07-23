import {create} from 'zustand';
import {useMapStore} from './mapStore';
import {sharePlan} from '../utils/api/mutations/sharePlan';

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
      setErrorNotification({message: 'No document found while generating share link', severity: 2});
      return;
    }
    const status = await sharePlan.mutate({
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharingMode,
    });

    const publicId = mapDocument?.public_id ?? -999;
    let shareableLink = new URL(`${window.location.origin}/map/${publicId}`);
    if (sharingMode === 'edit' && password === null) {
      shareableLink.pathname = `/map/edit/${mapDocument.document_id}`;
    } else {
    }
    if (sharingMode === 'edit') {
      // if (password !== null) {
      //   const status = await patchDocumentPassword.mutate({
      //     document_id: mapDocument?.document_id,
      //     password: password ?? null,
      //   });
      //   // copy to clipboard
      //   if (status !== undefined) {
      //     shareableLink.searchParams.set('pw', 'true');
      //   }
      // } else {
      // }
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
