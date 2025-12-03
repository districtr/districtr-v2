import {DocumentMetadata} from './types';
import {put} from '../factory';

export const saveMapDocumentMetadata = async ({
  document_id,
  metadata,
}: {
  document_id: string;
  metadata: Partial<DocumentMetadata>;
}) => {
  console.log('saving metadata', metadata);
  return await put<Partial<DocumentMetadata>, DocumentMetadata>(
    `document/${document_id}/metadata`
  )({
    body: {
      ...metadata
    },
  });
};
