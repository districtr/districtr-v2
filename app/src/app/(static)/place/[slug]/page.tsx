import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import StreamRenderer from '@/app/components/RichTextRenderer/StreamRenderer';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {PlaceMapGrid} from '@/app/components/Static/Interactions/PlaceMapGrid';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getCMSContent} from '@/app/utils/api/cmsContent';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const cmsData = await getCMSContent(slug, language, 'places').catch(() => null);
  const title = cmsData?.content?.published_content?.title;
  return title ? {title, description: `Draw and explore districting maps for ${title}`} : {};
}

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const [cmsData, maps] = await Promise.all([
    getCMSContent('places', slug, language),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  if (!cmsData?.content || !maps) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }

  // Preserve the order saved in the CMS, not the order of the available-maps list.
  const availableMaps = maps.ok
    ? (cmsData.content.districtr_map_slugs ?? [])
        .map(slug => maps.response.find(m => m.districtr_map_slug === slug))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
    : null;

  return (
    <Flex direction="column" width="100%" pt="4">
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.title}
      </Heading>
      <LanguagePicker
        preferredLanguage={language}
        availableLanguages={cmsData.available_languages}
      />
      <ContentSection title="Draw a plan from scratch">
        {Boolean(availableMaps?.length) && <PlaceMapGrid maps={availableMaps!} />}
      </ContentSection>

      <StreamRenderer body={cmsData.content.body} className="my-4" />
    </Flex>
  );
}
