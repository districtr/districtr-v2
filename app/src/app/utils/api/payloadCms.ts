/**
 * Payload CMS data fetching utilities for server components.
 *
 * Uses Payload's Local API for zero-overhead server-side queries.
 * Localized content is fetched via Payload's native locale parameter.
 */

import {getPayload} from 'payload';
import config from '@/payload.config';

export interface PayloadCmsContent {
  id: number | string;
  slug: string;
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
 * Fetch a single CMS content entry by slug and locale.
 * Falls back to English if the preferred language is not available (via Payload's fallback: true).
 */
export async function getPayloadCmsContent(
  slug: string,
  language: string = 'en',
  type: 'tags' | 'places'
): Promise<PayloadCmsContentWithLanguages | null> {
  try {
    const payload = await getPayload({config});

    // Fetch the document in the requested locale (Payload handles fallback to 'en')
    const result = await payload.find({
      collection: type,
      where: {
        slug: {equals: slug},
        _status: {equals: 'published'},
      },
      locale: language as any,
      limit: 1,
    });

    if (result.docs.length === 0) return null;

    const doc = result.docs[0] as Record<string, unknown>;

    // Fetch with locale: 'all' to determine which languages have content
    const allLocalesResult = await payload.find({
      collection: type,
      where: {
        slug: {equals: slug},
        _status: {equals: 'published'},
      },
      locale: 'all' as any,
      limit: 1,
    });

    const availableLanguages: string[] = [];
    if (allLocalesResult.docs.length > 0) {
      const allDoc = allLocalesResult.docs[0] as Record<string, unknown>;
      const titleByLocale = allDoc.title as Record<string, string> | undefined;
      if (titleByLocale && typeof titleByLocale === 'object') {
        for (const [locale, value] of Object.entries(titleByLocale)) {
          if (value) {
            availableLanguages.push(locale);
          }
        }
      }
    }

    // If no languages detected (shouldn't happen), at least include 'en'
    if (availableLanguages.length === 0) {
      availableLanguages.push('en');
    }

    return {
      content: {
        id: doc.id as number | string,
        slug: doc.slug as string,
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

    const result = await payload.find({
      collection: type,
      where: {
        _status: {equals: 'published' as const},
      },
      locale: (language || 'en') as any,
      limit: 200,
      sort: '-updatedAt',
    });

    return result.docs.map((doc: Record<string, unknown>) => ({
      id: doc.id as number | string,
      slug: doc.slug as string,
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
