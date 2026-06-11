import {LANG_MAPPING} from '../language';
import type {PlanGalleryProps} from '@/app/components/Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import type {CommentGalleryProps} from '@/app/components/Cms/RichTextEditor/extensions/CommentGallery/CommentGallery';
import type {MapCreateButtonsProps} from '@/app/components/Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons';

/**
 * Public content client for the Wagtail CMS service.
 *
 * Server components prefer CMS_URL (reachable from inside docker, e.g. http://cms:8000);
 * the browser uses NEXT_PUBLIC_CMS_URL (e.g. http://localhost:8001).
 * Mirrors how API_URL is resolved in `./constants`.
 */
export const CMS_API_URL =
  typeof window === 'undefined'
    ? (process.env.CMS_URL ?? process.env.NEXT_PUBLIC_CMS_URL)
    : process.env.NEXT_PUBLIC_CMS_URL;

export type CmsContentTypes = 'tags' | 'places';

/** StreamField blocks returned in `content.body` */
export interface RichTextBlock {
  type: 'rich_text';
  /** HTML string (b/i/u/s, h1-h6, ul/ol/li, blockquote, a, img, span color) */
  value: string;
  id: string;
}

export interface BoilerplateBlock {
  type: 'boilerplate';
  value: {customContent: string | null};
  id: string;
}

export interface SectionHeaderBlock {
  type: 'section_header';
  value: {title: string};
  id: string;
}

export interface PlanGalleryBlock {
  type: 'plan_gallery';
  /** camelCase props matching PLAN_GALLERY_ATTRIBUTES; ids/tags may be null (no filter) */
  value: PlanGalleryProps;
  id: string;
}

export interface CommentGalleryBlock {
  type: 'comment_gallery';
  /** camelCase props matching COMMENT_GALLERY_ATTRIBUTES; ids/tags may be null (no filter) */
  value: CommentGalleryProps;
  id: string;
}

export interface FormBlock {
  type: 'form';
  value: {mandatoryTags: string[]; allowListModules: string[]};
  id: string;
}

export interface MapCreateButtonsBlock {
  type: 'map_create_buttons';
  value: MapCreateButtonsProps;
  id: string;
}

export type CMSBodyBlock =
  | RichTextBlock
  | BoilerplateBlock
  | SectionHeaderBlock
  | PlanGalleryBlock
  | CommentGalleryBlock
  | FormBlock
  | MapCreateButtonsBlock;

export interface CMSContent {
  title: string;
  subtitle: string;
  slug: string;
  language: keyof typeof LANG_MAPPING;
  body: CMSBodyBlock[];
  updated_at: string;
}

export interface TagsCMSContent extends CMSContent {
  districtr_map_slug: string | null;
}
export interface PlacesCMSContent extends CMSContent {
  districtr_map_slugs: string[] | null;
}

interface CmsContentTypesEnum {
  tags: TagsCMSContent;
  places: PlacesCMSContent;
}

export interface CMSContentResponseWithLanguages<
  T extends keyof CmsContentTypesEnum = CmsContentTypes,
> {
  content: CmsContentTypesEnum[T];
  available_languages: string[];
  type: T;
}

export interface CMSContentListItem {
  slug: string;
  title: string;
  language: string;
  /** Map association for tags entries */
  districtr_map_slug?: string | null;
  /** Map associations for places entries */
  districtr_map_slugs?: string[] | null;
}

export type GallerySection =
  | 'consultant_drafts'
  | 'public_gallery'
  | 'works_in_progress'
  | 'coi_gallery';

export interface CMSGalleryEntry {
  /** Public id of the saved Districtr plan (document) in the FastAPI backend */
  document_public_id: number;
  caption: string;
}

export interface CMSGallery {
  title: string;
  slug: string;
  section: GallerySection;
  /** Rich-text HTML */
  description: string;
  entries: CMSGalleryEntry[];
}

/**
 * Shared fetch for the public CMS endpoints: resolves `path` against
 * CMS_API_URL, logs and returns null on a network error or non-2xx response,
 * and parses the body as T. A null return covers every "no usable content"
 * case the callers care about (404 missing page, 403 group_only gallery, etc.).
 */
async function cmsFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const url = `${CMS_API_URL}${path}`;
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error(`CMS request failed (${response.status}): ${url}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * Fetch a single live CMS page by slug. The CMS falls back to English when the
 * requested language has no live page; returns null on 404 (no live page at all).
 */
export const getCMSContent = <T extends CmsContentTypes>(
  type: T,
  slug: string,
  language: string = 'en'
): Promise<CMSContentResponseWithLanguages<T> | null> =>
  cmsFetch<CMSContentResponseWithLanguages<T>>(
    `/api/content/${type}/slug/${slug}?language=${language}`
  );

/**
 * Fetch a single live (published) curated plan gallery by slug. Returns null on
 * 404 (no live gallery) and on 403 (group_only gallery, no/insufficient token).
 * Pass `accessToken` to authenticate for group_only galleries; authorized
 * responses are fetched with no-store so they never enter a shared cache.
 */
export const getGallery = (slug: string, accessToken?: string): Promise<CMSGallery | null> =>
  cmsFetch<CMSGallery>(
    `/api/galleries/${slug}`,
    accessToken ? {headers: {Authorization: `Bearer ${accessToken}`}, cache: 'no-store'} : undefined
  );

/**
 * List live CMS pages of a given type. When `language` is provided, returns
 * only pages live in that language; when omitted, the CMS returns pages across
 * ALL languages (consumers dedupe by slug where needed).
 */
export const listCMSContent = (
  type: CmsContentTypes,
  params: {language?: string; offset?: number; limit?: number} = {}
): Promise<CMSContentListItem[] | null> => {
  const searchParams = new URLSearchParams();
  if (params.language) searchParams.set('language', params.language);
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  return cmsFetch<CMSContentListItem[]>(`/api/content/${type}/list?${searchParams.toString()}`);
};
