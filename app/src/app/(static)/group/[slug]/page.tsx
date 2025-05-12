import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getGroup} from '@/app/utils/api/apiHandlers/getGroup';
import {Box, Flex, Grid, Heading, Link} from '@radix-ui/themes';
import Image from 'next/image';
import {cookies} from 'next/headers';

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const [groupContent, maps] = await Promise.all([
    getGroup(slug),
    getAvailableDistrictrMaps(slug),
  ]).catch(() => [null, null]);

  if (!groupContent) {
    return (
      <Flex className="size-full" justify="center" align="center">
        <Heading>Content not found</Heading>
      </Flex>
    );
  }

  const availableMaps =
    groupContent.map_slugs &&
    maps?.filter(m => groupContent.map_slugs!.includes(m.districtr_map_slug));

  return (
    <Flex direction="column" width="100%" className="max-w-screen-lg mx-auto py-4">
      <Heading as="h1" size="6" mb="4">
        Group: {groupContent?.group?.name}
      </Heading>
      <Heading as="h3">Available Maps</Heading>

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
              <Flex key={i} className="items-center" direction="column" gapY="4" py="4">
                <object
                  type="image/png"
                  data="https://tilesets1.cdn.districtr.org/thumbnails/null.png"
                  width="150"
                  height="150"
                  aria-label="Preview with map outline"
                >
                  <Image src="/home-megaphone.png" alt="Fallback image" width="150" height="150" />
                </object>
                <CreateButton
                  key={i}
                  view={{
                    ...view,
                  }}
                />
              </Flex>
            ))}
          </>
        )}
      </Grid>
    </Flex>
  );
}
