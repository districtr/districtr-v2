import {DocumentCreate, DocumentObject} from './types';
import {post} from '../factory';
import {temporalManager} from '../../temporal';

export const createMapDocument = async (document: DocumentCreate) => {
  // Only clear the undo/redo history once the server has accepted the new doc. If
  // we clear eagerly and the network call fails, the user is left in the current
  // doc with no undo — doubly bad during the conflict-Fork flow.
  const response = await post<DocumentCreate, DocumentObject>('create_document')({
    body: document,
  });
  if (response.ok) {
    temporalManager.clear(document.map_type == 'community' ? 'coi' : 'districts');
  }
  return response;
};
