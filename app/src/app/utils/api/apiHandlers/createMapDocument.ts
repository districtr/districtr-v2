import {DocumentCreate, DocumentObject} from './types';
import {post} from '../factory';
import {temporalManager} from '../../temporal';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

export const createMapDocument = async (document: DocumentCreate) => {
  // Only clear the undo/redo history once the server has accepted the new doc. If
  // we clear eagerly and the network call fails, the user is left in the current
  // doc with no undo — doubly bad during the conflict-Fork flow.
  const response = await post<DocumentCreate, DocumentObject>('create_document')({
    body: document,
  });
  if (response.ok) {
    temporalManager.clear(
      document.map_type === MAP_TYPES.COMMUNITY ? MAP_MODES.COI : MAP_MODES.DISTRICTS
    );
  }
  return response;
};
