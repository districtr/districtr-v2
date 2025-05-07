import {listCMSContent} from '@/app/utils/api/cms';
import {onlyUniqueProperty} from '@/app/utils/arrays';
import {Card, Flex, Grid, Heading, Link} from '@radix-ui/themes';
import NextLink from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const cmsContent = await listCMSContent('places');

  const entries = cmsContent
    ?.filter(content => content.published_content)
    .filter(onlyUniqueProperty('slug'))
    .sort((a, b) => a.published_content!.title.localeCompare(b.published_content!.title));

  if (!entries) return null;

  return (
    <Flex direction={'column'} className="max-w-screen-xl mx-auto p-4">
      <Heading as="h1" size="6" mb="4">
        Places
      </Heading>
      <Grid
        columns={{
          initial: '1',
          md: '2',
          lg: '4',
        }}
        gap="4"
      >
        {entries.map(content => (
          <Card key={content.slug}>
            <Heading as="h3" size="4">
              {content.published_content!.title}
            </Heading>
            <NextLink href={`/place/${content.slug}`} passHref legacyBehavior>
              <Link>Go to place</Link>
            </NextLink>
          </Card>
        ))}
      </Grid>
    </Flex>
  );
}
