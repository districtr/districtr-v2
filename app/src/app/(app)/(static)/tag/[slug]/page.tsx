import {HeaderSecondTierNav} from '@/app/components/Cms/RichTextEditor/extensions/HeaderSecondTierNav/HeaderSecondTierNav';
import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getPayloadCmsContent} from '@/app/utils/api/payloadCms';
import {getCMSContent} from '@/app/utils/api/cms';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';

  // Try Payload first, fall back to legacy Python API
  const [payloadData, maps] = await Promise.all([
    getPayloadCmsContent(slug, language, 'tags'),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  // If Payload has content, use it
  if (payloadData?.content?.body && maps) {
    return (
      <Flex direction="column" width="100%">
        <Heading as="h1" size="6" mb="4">
          {payloadData.content.title}
        </Heading>
        <LanguagePicker
          preferredLanguage={language}
          availableLanguages={payloadData.availableLanguages}
        />
        <HeaderSecondTierNav />
        <RichTextRenderer content={payloadData.content.body} className="my-4" />
      </Flex>
    );
  }

  // Fall back to legacy Python CMS API (for pre-migration content)
  const cmsData = await getCMSContent(slug, language, 'tags').catch(() => null);

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
