import {useMapStore} from '@/app/store/mapStore';
import {sharePlan} from '../mutations';

export const getShareLink = async (
  password: string | null,
  sharetype: string,
  setIsVisible: (isVisible: boolean) => void,
  setPasswordDisabled: (isDisabled: boolean) => void,
  setLinkCopied: (isCopied: boolean) => void
) => {
  const {upsertUserMap, setErrorNotification, mapDocument} = useMapStore.getState();
  if (!mapDocument?.document_id) {
    setErrorNotification({message: 'No document found while', severity: 2});
    return;
  }
  const payload = {
    document_id: mapDocument?.document_id,
    password: password ?? null,
    access_type: sharetype,
  };

  try {
    // get the share link
    const token = await sharePlan.mutate(payload);
    // copy to clipboard
    if (token !== undefined) {
      const shareableLink = `${window.location.origin}?share=${token.token}`;
      navigator.clipboard.writeText(shareableLink);

      if (password !== null && mapDocument?.document_id) {
        upsertUserMap({
          documentId: mapDocument?.document_id,
          mapDocument: {
            ...mapDocument,
            password: password,
          },
        });
        setIsVisible(false);
      }
      if (sharetype === 'edit') {
        setPasswordDisabled(true);
      }
      // Set link copied state
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  } catch (error) {
    console.error('Error creating share link: ', error);
    useMapStore
      .getState()
      .setErrorNotification({message: 'Error creating share link', severity: 2});
  }
};
