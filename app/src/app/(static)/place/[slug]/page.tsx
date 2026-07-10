import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {PlaceMapGrid} from '@/app/components/Static/Interactions/PlaceMapGrid';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getCMSContent} from '@/app/utils/api/cms';
import {Flex, Heading} from '@radix-ui/themes';
import {ImportBlockAssignments} from '@/app/components/Static/Interactions/ImportBlockAssignments';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const [cmsData, maps] = await Promise.all([
    getCMSContent(slug, language, 'places'),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  if (!cmsData?.content?.published_content || !maps) {
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
        <Flex direction="column" align="start" pt="3">
          <ImportBlockAssignments />
        </Flex>
      </ContentSection>

      <RichTextRenderer content={cmsData.content.published_content.body} className="my-4" />
    </Flex>
  );
}
