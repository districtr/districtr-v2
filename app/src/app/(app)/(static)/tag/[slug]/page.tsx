import {HeaderSecondTierNav} from '@/app/components/Cms/RichTextEditor/extensions/HeaderSecondTierNav/HeaderSecondTierNav';
import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getPayloadCmsContent} from '@/app/utils/api/payloadCms';
import {RichText} from '@payloadcms/richtext-lexical/react';
import {blockConverters} from '@/payload/converters/blockConverters';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';

  const [payloadData, maps] = await Promise.all([
    getPayloadCmsContent(slug, language, 'tags'),
    getAvailableDistrictrMaps({}),
  ]).catch(() => [null, null]);

  if (!payloadData?.content || !maps) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }

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
      {payloadData.content.body != null && (
        <div className="prose my-4">
          <RichText data={payloadData.content.body as any} converters={blockConverters} />
        </div>
      )}
    </Flex>
  );
}
