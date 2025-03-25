import axios from 'axios';
import {API_URL} from './constants';

// Define interfaces for CMS content
export interface CMSContentCreate {
  slug: string;
  districtr_map_slug?: string | null;
  language: string;
  draft_content?: Record<string, any> | null;
  published_content?: Record<string, any> | null;
}

export interface CMSContent {
  id: string;
  slug: string;
  language: string;
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

export interface CMSContentResponseWithLanguages<T = TagsCMSContent | PlacesCMSContent> {
  content: T;
  available_languages: string[];
}

export type CmsContentTypes = 'tags' | 'places';

// API functions for CMS operations
export const createCMSContent = async (
  content: CMSContentCreate,
  type: CmsContentTypes
): Promise<TagsCMSContent | PlacesCMSContent> => {
  try {
    const response = await axios.post(`${API_URL}/api/cms/content/${type}`, content);
    return response.data;
  } catch (error) {
    console.error('Error creating CMS content:', error);
    throw error;
  }
};

export const getCMSContent = async (
  slug: string,
  language: string = 'en',
  type: CmsContentTypes = 'tags'
): Promise<CMSContentResponseWithLanguages> => {
  try {
    const url = new URL(`${API_URL}/api/cms/content/${type}/${slug}`);
    if (language) url.searchParams.append('language', language);
    const response = await axios.get(url.toString());
    return response.data;
  } catch (error) {
    console.error('Error getting CMS content:', error);
    throw error;
  }
};

export const listCMSContent = async (
  type: CmsContentTypes,
  params: {language?: string; districtr_map_slug?: string} = {}
): Promise<TagsCMSContent[] | PlacesCMSContent[]> => {
  try {
    const url = new URL(`${API_URL}/api/cms/content/${type}`);
    if (params.language) url.searchParams.append('language', params.language);
    if (params.districtr_map_slug) url.searchParams.append('districtr_map_slug', params.districtr_map_slug);
    const response = await axios.get(url.toString());
    return response.data;
  } catch (error) {
    console.error('Error listing CMS content:', error);
    throw error;
  }
};

export const updateCMSContent = async (
  contentId: string,
  type: CmsContentTypes,
  updates: Partial<CMSContentCreate>
): Promise<TagsCMSContent | PlacesCMSContent> => {
  try {
    const response = await axios.put(`${API_URL}/api/cms/content/${type}/${contentId}`, updates);
    return response.data;
  } catch (error) {
    console.error('Error updating CMS content:', error);
    throw error;
  }
};

export const deleteCMSContent = async (contentId: string, type: CmsContentTypes): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/api/cms/content/${type}/${contentId}`);
  } catch (error) {
    console.error('Error deleting CMS content:', error);
    throw error;
  }
};

export const publishCMSContent = async (
  contentId: string,
  type: CmsContentTypes
): Promise<TagsCMSContent | PlacesCMSContent> => {
  try {
    const response = await axios.post(`${API_URL}/api/cms/content/${type}/${contentId}/publish`);
    return response.data;
  } catch (error) {
    console.error('Error publishing CMS content:', error);
    throw error;
  }
};
