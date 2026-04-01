/**
 * Payload CMS data fetching utilities for server components.
 *
 * Uses Payload's Local API for zero-overhead server-side queries.
 * Replaces the old Python backend CMS API calls.
 */

import {getPayload} from 'payload';
import config from '@/payload.config';

export interface PayloadCmsContent {
  id: number | string;
  slug: string;
  language: string;
  title: string;
  subtitle?: string;
  body?: unknown; // Lexical JSON — render with <RichText />
  districtrMapSlug?: string | null;
  districtrMapSlugs?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayloadCmsContentWithLanguages {
  content: PayloadCmsContent;
  availableLanguages: string[];
  type: 'tags' | 'places';
}

/**
 * Fetch a single CMS content entry by slug and language.
 * Falls back to English if the preferred language is not available.
 */
export async function getPayloadCmsContent(
  slug: string,
  language: string = 'en',
  type: 'tags' | 'places',
  draft: boolean = false
): Promise<PayloadCmsContentWithLanguages | null> {
  try {
    const payload = await getPayload({config});

    // Find all language versions of this slug
    // When draft is true, include unpublished content for live preview
    const where: Record<string, unknown> = {
      slug: {equals: slug},
    };
    if (!draft) {
      where._status = {equals: 'published'};
    }

    const allVersions = await payload.find({
      collection: type,
      where,
      limit: 10,
      draft,
    });

    if (allVersions.docs.length === 0) return null;

    const availableLanguages = allVersions.docs.map(
      (doc: Record<string, unknown>) => doc.language as string
    );

    // Prefer requested language, fall back to English
    const preferredLang = availableLanguages.includes(language) ? language : 'en';
    const doc = allVersions.docs.find(
      (d: Record<string, unknown>) => d.language === preferredLang
    ) as Record<string, unknown> | undefined;

    if (!doc) return null;

    return {
      content: {
        id: doc.id as number | string,
        slug: doc.slug as string,
        language: doc.language as string,
        title: (doc.title as string) || '',
        subtitle: doc.subtitle as string | undefined,
        body: doc.body,
        districtrMapSlug: doc.districtrMapSlug as string | null | undefined,
        districtrMapSlugs: doc.districtrMapSlugs as string[] | null | undefined,
        createdAt: doc.createdAt as string,
        updatedAt: doc.updatedAt as string,
      },
      availableLanguages,
      type,
    };
  } catch (error) {
    console.error(`Error fetching Payload CMS content (${type}/${slug}):`, error);
    return null;
  }
}

/**
 * List all published CMS content of a given type.
 */
export async function listPayloadCmsContent(
  type: 'tags' | 'places',
  language?: string
): Promise<PayloadCmsContent[]> {
  try {
    const payload = await getPayload({config});

    const where = language
      ? {
          and: [
            {_status: {equals: 'published' as const}},
            {language: {equals: language}},
          ],
        }
      : {_status: {equals: 'published' as const}};

    const result = await payload.find({
      collection: type,
      where: where as any,
      limit: 200,
      sort: '-updatedAt',
    });

    return result.docs.map((doc: Record<string, unknown>) => ({
      id: doc.id as number | string,
      slug: doc.slug as string,
      language: doc.language as string,
      title: (doc.title as string) || '',
      subtitle: doc.subtitle as string | undefined,
      body: doc.body,
      districtrMapSlug: doc.districtrMapSlug as string | null | undefined,
      districtrMapSlugs: doc.districtrMapSlugs as string[] | null | undefined,
      createdAt: doc.createdAt as string,
      updatedAt: doc.updatedAt as string,
    }));
  } catch (error) {
    console.error(`Error listing Payload CMS content (${type}):`, error);
    return [];
  }
}
