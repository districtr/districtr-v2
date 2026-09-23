import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import StreamRenderer from '@/app/components/RichTextRenderer/StreamRenderer';
import {getCMSContent} from '@/app/utils/api/cmsContent';
import {Flex, Heading} from '@radix-ui/themes';
import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';

// Catch-all for CMS-authored static pages. Hardcoded routes (about/, rules/,
// ...) take precedence in Next.js routing, so pages migrate into the CMS one
// at a time: delete the hardcoded route and publish a StaticPage of the same
// slug.
export const revalidate = 3600;

export async function generateMetadata({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const cmsData = await getCMSContent('static', slug, language).catch(() => null);
  const title = cmsData?.content?.title;
  return title ? {title} : {};
}

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const cmsData = await getCMSContent('static', slug, language).catch(() => null);

  if (!cmsData?.content) {
    notFound();
  }

  return (
    <Flex direction="column" width="100%" py="6">
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.title}
      </Heading>
      <LanguagePicker
        preferredLanguage={language}
        availableLanguages={cmsData.available_languages}
      />
      <StreamRenderer body={cmsData.content.body} className="my-4" />
    </Flex>
  );
}
