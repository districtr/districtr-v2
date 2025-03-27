import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextPreview from '@/app/components/RichTextPreview';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getCMSContent} from '@/app/utils/api/cms';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const [cmsData, maps] = await Promise.all([
    getCMSContent(slug, language, 'tags'),
    getAvailableDistrictrMaps(),
  ]);

  if (!cmsData?.content?.published_content) {
    return <div>Content not found</div>;
  }
  const selectedMap =
    cmsData.content.districtr_map_slug &&
    maps.find(m => m.districtr_map_slug === cmsData.content.districtr_map_slug);
  return (
    <Flex direction="column" width="100%" className="max-w-screen-lg mx-auto py-4">
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.published_content.title}
      </Heading>
      <LanguagePicker
        preferredLanguage={language}
        availableLanguages={cmsData.available_languages}
      />
      <RichTextPreview content={cmsData.content.published_content.body} className="my-4" />
      {Boolean(selectedMap) && (
        <CreateButton
          view={{
            ...selectedMap
          }}
        />
      )}
    </Flex>
  );
}
