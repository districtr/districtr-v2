import {get, patch} from './factory';

export interface SiteSettings {
  under_construction: boolean;
}

export const getSiteSettings = get<SiteSettings>('cms/site_settings');
export const updateSiteSettings = patch<SiteSettings, SiteSettings>('cms/site_settings');
