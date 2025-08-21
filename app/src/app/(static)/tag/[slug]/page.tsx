import { HeaderSecondTierNav } from '@/app/components/Cms/RichTextEditor/extensions/HeaderSecondTierNav/HeaderSecondTierNav';
import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getCMSContent} from '@/app/utils/api/cms';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const [cmsData, maps] = await Promise.all([
    getCMSContent(slug, language, 'tags'),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  if (!cmsData?.content?.published_content || !maps) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }

  return (
    <Flex direction="column" width="100%">
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.published_content.title}
      </Heading>
      <LanguagePicker
        preferredLanguage={language}
        availableLanguages={cmsData.available_languages}
      />
      <HeaderSecondTierNav />
      <RichTextRenderer content={cmsData.content.published_content.body} className="my-4" />
    </Flex>
  );
}
