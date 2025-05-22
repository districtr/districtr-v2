import {GroupsCMSContent, listCMSContent, PlacesCMSContent} from '@/app/utils/api/cms';
import {onlyUniqueProperty} from '@/app/utils/arrays';
import {Card, Flex, Grid, Heading, Link, Text} from '@radix-ui/themes';
import NextLink from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function GroupsPage() {
  const cmsContent = await listCMSContent('groups');

  const entries = cmsContent
    ?.filter(content => content.published_content)
    .filter(onlyUniqueProperty('slug'))
    .sort((a, b) =>
      a.published_content!.title.localeCompare(b.published_content!.title)
    ) as GroupsCMSContent[];

  if (!entries) return null;

  return (
    <Flex direction={'column'}>
      <Heading as="h1" size="6" mb="4">
        Groups
      </Heading>
      <Grid
        columns={{
          initial: '1',
          md: '2',
          lg: '4',
        }}
        gap="4"
      >
        {entries.length === 0 && <Text>No places available.</Text>}
        {entries.map(content => (
          <Card key={content.slug}>
            <Heading as="h3" size="4">
              {content.published_content!.title}
            </Heading>
            {!!(content?.group_slugs && content?.group_slugs?.length) && (
              <Text>
                {content.group_slugs.length} map group
                {content.group_slugs.length === 1 ? '' : 's'}
              </Text>
            )}
            <br />
            <NextLink href={`/group/${content.slug}`} passHref legacyBehavior>
              <Link>Go to group</Link>
            </NextLink>
          </Card>
        ))}
      </Grid>
    </Flex>
  );
}
