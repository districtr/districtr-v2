import {DocumentCreate, DocumentObject} from './types';
import {post} from '../factory';
import {temporalManager} from '../../temporal';

export const createMapDocument = async (document: DocumentCreate) => {
  temporalManager.clear(document.map_type == 'community' ? 'coi' : 'districts');
  return post<DocumentCreate, DocumentObject>('create_document')({body: document});
};
