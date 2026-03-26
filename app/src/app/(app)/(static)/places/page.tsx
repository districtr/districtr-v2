import {listPayloadCmsContent} from '@/app/utils/api/payloadCms';
import {fastUniqBy} from '@/app/utils/arrays';
import {Card, Flex, Grid, Heading, Text, Link} from '@radix-ui/themes';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function PlacesPage() {
  const content = await listPayloadCmsContent('places', 'en').catch(() => []);
  const entries = fastUniqBy(content, 'slug').sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Flex direction={'column'}>
      <Heading as="h1" size="6" mb="4">
        Places
      </Heading>
      <Grid columns={{initial: '1', md: '2', lg: '4'}} gap="4">
        {entries.length === 0 && <Text>No places available.</Text>}
        {entries.map(content => (
          <Card key={content.slug}>
            <Heading as="h3" size="4">
              {content.title}
            </Heading>
            {Boolean(content.districtrMapSlugs?.length) && (
              <Text>
                {content.districtrMapSlugs!.length} map module
                {content.districtrMapSlugs!.length === 1 ? '' : 's'}
              </Text>
            )}
            <br />
            <Link href={`/place/${content.slug}`}>Go to place</Link>
          </Card>
        ))}
      </Grid>
    </Flex>
  );
}
