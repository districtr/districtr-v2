import {DocumentCreate, DocumentObject} from './types';
import {post} from '../factory';
import {temporalManager} from '../../temporal';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

export const createMapDocument = async (document: DocumentCreate) => {
  temporalManager.clear(
    document.map_type === MAP_TYPES.COMMUNITY ? MAP_MODES.COI : MAP_MODES.DISTRICTS
  );
  return post<DocumentCreate, DocumentObject>('create_document')({body: document});
};
