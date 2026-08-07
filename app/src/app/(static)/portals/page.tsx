import {listCMSContent} from '@/app/utils/api/cmsContent';
import {fastUniqBy} from '@/app/utils/arrays';
import {Card, Flex, Grid, Heading, Text, Link} from '@radix-ui/themes';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export const metadata = {
  title: 'Portals',
  description: 'Organization and event portals on Districtr',
};

export default async function PortalsPage() {
  const cmsContent = await listCMSContent('tags');
  if (!cmsContent) return null;

  const entries = fastUniqBy(cmsContent, 'slug').sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Flex direction={'column'} pt="6">
      <Heading as="h1" size="6" mb="4">
        Portals
      </Heading>
      <Grid
        columns={{
          initial: '1',
          md: '2',
          lg: '4',
        }}
        gap="4"
      >
        {entries.length === 0 && <Text>No portals found</Text>}
        {entries.map(content => (
          <Card key={content.slug}>
            <Heading as="h3" size="4">
              {content.title}
            </Heading>
            <Link href={`/portal/${content.slug}`}>Go to portal</Link>
          </Card>
        ))}
      </Grid>
    </Flex>
  );
}
