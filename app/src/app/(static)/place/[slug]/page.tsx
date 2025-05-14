import {LanguagePicker} from '@/app/components/LanguagePicker/LanguagePicker';
import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getCMSContent} from '@/app/utils/api/cms';
import {Box, Flex, Grid, Heading, Link} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const [cmsData, maps] = await Promise.all([
    getCMSContent(slug, language, 'places'),
    getAvailableDistrictrMaps(),
  ]).catch(() => [null, null]);
  
  if (!cmsData?.content?.published_content || !maps) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }
  console.log('!!!PlacePageContent', JSON.stringify(cmsData, null, 2));
  console.log('!!!MapsViews', JSON.stringify(maps, null, 2));

  const availableMaps =
    cmsData.content.districtr_map_slugs &&
    maps.filter(m => cmsData.content.districtr_map_slugs!.includes(m.districtr_map_slug));

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
        <Grid
          gap="2"
          columns={{
            initial: '1',
            md: '2',
            lg: '4',
          }}
        >
          {Boolean(availableMaps) && (
            <>
              {availableMaps!.map((view, i) => (
                <CreateButton
                  key={i}
                  view={{
                    ...view,
                  }}
                />
              ))}
            </>
          )}
        </Grid>
      </ContentSection>

      <RichTextRenderer content={cmsData.content.published_content.body} className="my-4" />
    </Flex>
  );
}
