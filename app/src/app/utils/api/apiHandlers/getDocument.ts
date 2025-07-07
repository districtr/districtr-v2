import axios from 'axios';
import {DocumentObject} from './types';
import {useMapStore} from '@store/mapStore';

export const getDocument = async (document_id: string): Promise<DocumentObject> => {
  if (!document_id) throw new Error('No document id found');

  const {userID, isEditing} = useMapStore.getState();

  // In edit mode, use the document UUID directly
  // In view mode, use the public sharing endpoint for numeric IDs
  let url: URL;
  if (isEditing || !document_id.match(/^\d+$/)) {
    // Edit mode or non-numeric ID: use regular document endpoint
    url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}`);
    if (userID) {
      url.searchParams.set('user_id', userID);
    }
  } else {
    // View mode with numeric ID: use public sharing endpoint
    url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/share/public/${document_id}`);
    if (userID) {
      url.searchParams.set('user_id', userID);
    }
  }

  return await axios.get(url.toString()).then(res => {
    return res.data;
  });
};
