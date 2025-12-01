import {DocumentMetadata} from './types';
import {put} from '../factory';

export const saveMapDocumentMetadata = async ({
  document_id,
  metadata,
}: {
  document_id: string;
  metadata: Partial<DocumentMetadata>;
}) => {
  return await put<{metadata: Partial<DocumentMetadata>}, DocumentMetadata>(
    `document/${document_id}/metadata`
  )({
    body: {
      metadata,
    },
  });
};
