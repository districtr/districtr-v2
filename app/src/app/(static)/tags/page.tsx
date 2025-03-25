import {listCMSContent} from '@/app/utils/api/cms';
import {onlyUniqueProperty} from '@/app/utils/arrays';
import {Box, Card, Flex, Heading, Link} from '@radix-ui/themes';
import NextLink from 'next/link';

export default async function TagsPage() {
  const cmsContent = await listCMSContent('tags');
  const entries = cmsContent
    .filter(content => content.published_content)
    .filter(onlyUniqueProperty('slug'));

  return (
    <Flex direction={'column'} className="max-w-screen-xl mx-auto py-4">
      <Heading as="h1" size="6" mb="4">
        Problems
      </Heading>
      <Box>
        {entries.map(content => (
          <Card key={content.slug}>
            <Heading as="h3" size="4">
              {content.published_content!.title}
            </Heading>
            <NextLink href={`/tag/${content.slug}`} passHref legacyBehavior>
              <Link>Go to tag</Link>
            </NextLink>
          </Card>
        ))}
      </Box>
    </Flex>
  );
}
