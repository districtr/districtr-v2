import {DocumentMetadata} from './api/apiHandlers/types';
import {DEFAULT_DRAFT_STATUS} from '@/app/constants/map/draftStatus';

export const LANG_MAPPING = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
} as const;

export const MAX_TITLE_LENGTH = 36;

export const DEFAULT_MAP_METADATA: DocumentMetadata = {
  name: null,
  group: null,
  tags: null,
  description: null,
  eventId: null,
  draft_status: DEFAULT_DRAFT_STATUS,
};
