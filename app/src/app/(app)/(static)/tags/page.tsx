import {listCMSContent, PlacesCMSContent} from '@/app/utils/api/cms';
import {fastUniqBy} from '@/app/utils/arrays';
import {Card, Flex, Grid, Heading, Text, Link} from '@radix-ui/themes';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function TagsPage() {
  const cmsContent = await listCMSContent('tags');
  const cmsContentWithPublishedContent = cmsContent?.filter(content => content.published_content);
  if (!cmsContentWithPublishedContent) return null;

  const entries = fastUniqBy(cmsContentWithPublishedContent, 'slug').sort((a, b) =>
    a.published_content!.title.localeCompare(b.published_content!.title)
  ) as PlacesCMSContent[];

  if (!entries) return null;

  return (
    <Flex direction={'column'}>
      <Heading as="h1" size="6" mb="4">
        Tags
      </Heading>
      <Grid
        columns={{
          initial: '1',
          md: '2',
          lg: '4',
        }}
        gap="4"
      >
        {entries.length === 0 && <Text>No tags found</Text>}
        {entries.map(content => (
          <Card key={content.slug}>
            <Heading as="h3" size="4">
              {content.published_content!.title}
            </Heading>
            <Link href={`/tag/${content.slug}`}>Go to tag</Link>
          </Card>
        ))}
      </Grid>
    </Flex>
  );
}
