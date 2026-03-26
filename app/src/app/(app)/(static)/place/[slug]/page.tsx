import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {PlaceMapGrid} from '@/app/components/Static/Interactions/PlaceMapGrid';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getPayloadCmsContent} from '@/app/utils/api/payloadCms';
import {getCMSContent} from '@/app/utils/api/cms';
import {RichText} from '@payloadcms/richtext-lexical/react';
import {blockConverters} from '@/payload/converters/blockConverters';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';

  const [payloadData, maps] = await Promise.all([
    getPayloadCmsContent(slug, language, 'places'),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  // If Payload has content, render with Payload's Lexical renderer
  if (payloadData?.content?.body && maps) {
    const availableMaps =
      maps.ok && payloadData.content.districtrMapSlugs
        ? maps.response.filter((m: {districtr_map_slug: string}) =>
            payloadData.content.districtrMapSlugs!.includes(m.districtr_map_slug)
          )
        : null;

    return (
      <Flex direction="column" width="100%">
        <Heading as="h1" size="6" mb="4">
          {payloadData.content.title}
        </Heading>
        <LanguagePicker
          preferredLanguage={language}
          availableLanguages={payloadData.availableLanguages}
        />
        <ContentSection title="Draw a plan from scratch">
          {Boolean(availableMaps?.length) && <PlaceMapGrid maps={availableMaps!} />}
        </ContentSection>
        <div className="prose my-4">
          <RichText data={payloadData.content.body} converters={blockConverters} />
        </div>
      </Flex>
    );
  }

  // Fall back to legacy Python CMS API (Tiptap content)
  const cmsData = await getCMSContent(slug, language, 'places').catch(() => null);

  if (!cmsData?.content?.published_content || !maps) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }

  const availableMaps = maps.ok
    ? maps.response.filter((m: {districtr_map_slug: string}) =>
        cmsData.content.districtr_map_slugs!.includes(m.districtr_map_slug)
      )
    : null;

  return (
    <Flex direction="column" width="100%">
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.published_content.title}
      </Heading>
      <LanguagePicker
        preferredLanguage={language}
        availableLanguages={cmsData.available_languages}
      />
      <ContentSection title="Draw a plan from scratch">
        {Boolean(availableMaps?.length) && <PlaceMapGrid maps={availableMaps!} />}
      </ContentSection>
      <RichTextRenderer content={cmsData.content.published_content.body} className="my-4" />
    </Flex>
  );
}
