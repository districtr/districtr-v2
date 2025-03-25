import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextPreview from '@/app/components/RichTextPreview';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import {getCMSContent} from '@/app/utils/api/cms';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const cmsData = await getCMSContent(slug, language, 'places');

  if (!cmsData.content.published_content) {
    return <div>Content not found</div>;
  }
  return (
    <Flex direction="column" className="max-w-screen-lg mx-auto" py="4">
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.published_content.title}
      </Heading>
      <LanguagePicker
        preferredLanguage={language}
        availableLanguages={cmsData.available_languages}
      />
      <RichTextPreview content={cmsData.content.published_content.body} className="my-4" />
      {/* @ts-ignore */}
      {Boolean(cmsData.content.districtr_map_slugs) && (
        <>
        {/* @ts-ignore */}
          {cmsData.content.districtr_map_slugs.map((slug: string) => (
            <CreateButton view={{
              districtr_map_slug: slug,
              name: slug
            }} />
          ))}
        </>
      )}
    </Flex>
  );
}
