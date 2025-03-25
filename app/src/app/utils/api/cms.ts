import axios from 'axios';

// Define interfaces for CMS content
export interface CMSContentCreate {
  slug: string;
  districtr_map_slug?: string | null;
  language: string;
  draft_content?: Record<string, any> | null;
  published_content?: Record<string, any> | null;
}

export interface CMSContentResponse {
  id: string;
  slug: string;
  districtr_map_slug: string | null;
  language: string;
  draft_content: Record<string, any> | null;
  published_content: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

// API functions for CMS operations
export const createCMSContent = async (content: CMSContentCreate): Promise<CMSContentResponse> => {
  try {
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/api/cms/content`,
      content
    );
    return response.data;
  } catch (error) {
    console.error('Error creating CMS content:', error);
    throw error;
  }
};

export const getCMSContent = async (
  slug: string,
  language: string = 'en'
): Promise<CMSContentResponse> => {
  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_API_URL}/api/cms/content/${slug}?language=${language}`
    );
    return response.data;
  } catch (error) {
    console.error('Error getting CMS content:', error);
    throw error;
  }
};

export const listCMSContent = async (
  params: {language?: string; districtr_map_slug?: string} = {}
): Promise<CMSContentResponse[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.districtr_map_slug)
      queryParams.append('districtr_map_slug', params.districtr_map_slug);

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/cms/content?${queryParams.toString()}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error listing CMS content:', error);
    throw error;
  }
};

export const updateCMSContent = async (
  contentId: string,
  updates: Partial<CMSContentCreate>
): Promise<CMSContentResponse> => {
  try {
    const response = await axios.put(
      `${process.env.NEXT_PUBLIC_API_URL}/api/cms/content/${contentId}`,
      updates
    );
    return response.data;
  } catch (error) {
    console.error('Error updating CMS content:', error);
    throw error;
  }
};

export const deleteCMSContent = async (contentId: string): Promise<void> => {
  try {
    await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/cms/content/${contentId}`);
  } catch (error) {
    console.error('Error deleting CMS content:', error);
    throw error;
  }
};

export const publishCMSContent = async (contentId: string): Promise<CMSContentResponse> => {
  try {
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/api/cms/content/${contentId}/publish`
    );
    return response.data;
  } catch (error) {
    console.error('Error publishing CMS content:', error);
    throw error;
  }
};
