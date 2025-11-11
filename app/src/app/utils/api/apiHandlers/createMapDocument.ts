import {DocumentCreate, DocumentObject} from './types';
import {post} from '../factory';

export const createMapDocument = async (document: DocumentCreate) =>
  post<DocumentCreate, DocumentObject>('create_document')({body: document});
