import {post} from '../factory';
import {ClientSession} from '@/app/lib/auth0';

export const generateThumbnail = async (documentId: string, session: ClientSession) => {
  const response = await post<{documentId: string}, {message: string}>(
    `document/${documentId}/thumbnail`
  )({
    body: {
      documentId,
    },
    session,
  });

  return response;
};
