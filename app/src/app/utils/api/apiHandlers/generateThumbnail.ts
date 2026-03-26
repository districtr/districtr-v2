import {post} from '../factory';
import {AppSession} from '@/app/lib/session';

export const generateThumbnail = async (documentId: string, session: AppSession) => {
  const response = await post<{documentId: string}, {message: string; public_id: number}>(
    `document/${documentId}/thumbnail`
  )({
    body: {
      documentId,
    },
    session,
  });

  return response;
};
