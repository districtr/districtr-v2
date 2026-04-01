import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import {RefreshRouteOnSave} from '@/app/components/LivePreview/RefreshRouteOnSave';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {PlaceMapGrid} from '@/app/components/Static/Interactions/PlaceMapGrid';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getPayloadCmsContent} from '@/app/utils/api/payloadCms';
import {RichText} from '@payloadcms/richtext-lexical/react';
import {blockConverters} from '@/payload/converters/blockConverters';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies, draftMode} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const {isEnabled: isDraft} = await draftMode();
  const language = userCookies.get('language')?.value ?? 'en';

  const [payloadData, maps] = await Promise.all([
    getPayloadCmsContent(slug, language, 'places', isDraft),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  if (!payloadData?.content || !maps) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }

  const availableMaps =
    maps.ok && payloadData.content.districtrMapSlugs
      ? maps.response.filter((m: {districtr_map_slug: string}) =>
          payloadData.content.districtrMapSlugs!.includes(m.districtr_map_slug)
        )
      : null;

  return (
    <Flex direction="column" width="100%">
      {isDraft && <RefreshRouteOnSave />}
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
      {payloadData.content.body != null && (
        <div className="prose my-4">
          <RichText data={payloadData.content.body as any} converters={blockConverters} />
        </div>
      )}
    </Flex>
  );
}
