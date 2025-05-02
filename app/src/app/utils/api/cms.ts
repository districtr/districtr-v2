import {LANG_MAPPING} from '../language';
import {get, patch, post, del} from './factory';
import {ClientSession} from '@/app/lib/auth0';

export interface CMSContentCreate {
  slug: string;
  content_type: 'tags' | 'places';
  districtr_map_slug?: string | undefined;
  districtr_map_slugs?: string[] | undefined;
  language: string;
  draft_content?: Record<string, any> | null;
  published_content?: Record<string, any> | null;
}

export interface CMSContentUpdate {
  content_type: 'tags' | 'places';
  content_id: string;
  updates: Partial<CMSContentCreate>;
}

export interface CMSContentId {
  content_type: 'tags' | 'places';
  content_id: string;
}

export interface CMSContent {
  id: string;
  slug: string;
  language: keyof typeof LANG_MAPPING;
  draft_content: Record<string, any> | null;
  published_content: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface TagsCMSContent extends CMSContent {
  districtr_map_slug: string | null;
}
export interface PlacesCMSContent extends CMSContent {
  districtr_map_slugs: string[] | null;
}

export type AllCmsContent = TagsCMSContent | PlacesCMSContent;
export type AllCmsLists =
  | TagsCMSContent[]
  | PlacesCMSContent[]
  | (TagsCMSContent | PlacesCMSContent)[];

export type AllCmsEntries =
  | {
      contentType: 'tags';
      content: TagsCMSContent;
    }
  | {
      contentType: 'places';
      content: PlacesCMSContent;
    };

export type CmsContentTypes = 'tags' | 'places';
interface CmsContentTypesEnum {
  tags: TagsCMSContent;
  places: PlacesCMSContent;
}

export interface CMSContentResponseWithLanguages<
  T extends keyof CmsContentTypesEnum = CmsContentTypes,
> {
  content: CmsContentTypesEnum[T];
  available_languages: string[];
}

export const createCMSContent = post<CMSContentCreate, Promise<TagsCMSContent | PlacesCMSContent>>(
  'cms/content'
);

export const updateCMSContent = patch<CMSContentUpdate, Promise<TagsCMSContent | PlacesCMSContent>>(
  'cms/content'
);

export const publishCMSContent = post<CMSContentId, Promise<TagsCMSContent | PlacesCMSContent>>(
  'cms/content/publish'
);

export const deleteCMSContent = async ({
  body: {content_id, content_type},
  session,
}: {
  body: {content_id: string; content_type: CmsContentTypes};
  session: ClientSession;
}) => {
  const url = `cms/content/${content_type}/${content_id}`;
  return await del(url)({session});
};

export const getCMSContent = async <T extends CmsContentTypes>(
  slug: string,
  language: string = 'en',
  type: T
): Promise<CMSContentResponseWithLanguages<T> | null> => {
  let url = `cms/content/${type}/slug/${slug}?language=${language}`;
  const content = await get<Promise<CMSContentResponseWithLanguages<T>>>(url)({});
  if (content.ok) {
    return content.response;
  } else {
    console.error(content.error);
    return null;
  }
};

export const listCMSContent = async (
  type: CmsContentTypes,
  params: {language?: string; districtr_map_slug?: string} = {}
): Promise<AllCmsLists | null> => {
  const url = `cms/content/${type}/list`;
  const content = await  get<Promise<AllCmsLists>>(url.toString())({});
  if (content.ok) {
    return content.response;
  } else {
    console.error(content.error);
    return null;
  }
};

export const listAuthoredCMSContent = async (
  type: CmsContentTypes,
  params: {language?: string; districtr_map_slug?: string} = {},
  session: ClientSession
): Promise<AllCmsLists | null> => {
  const url = `cms/content/${type}/list/authored`;
  const content = await get<Promise<AllCmsLists>>(url.toString())({body: {}, session});
  if (content.ok) {
    return content.response;
  } else {
    console.error(content.error);
    return null;
  }
};
