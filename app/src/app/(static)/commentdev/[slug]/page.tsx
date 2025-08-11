import {Box, Flex, Grid, Heading, IconButton, Link, Text} from '@radix-ui/themes';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {getDocumentComments} from '@/app/utils/api/apiHandlers/getComments';
import { PersonIcon } from '@radix-ui/react-icons';
import { formatDistanceToNow } from 'date-fns'

export default async function DevPage({params}: {params: Promise<{slug: string}>}) {
  const [{slug}] = await Promise.all([params]);
  const comments = await getDocumentComments(slug);

  return (
    <Flex direction="column" width="100%">
      <Heading as="h1" size="6" mb="4">
        Latest Comments
      </Heading>
      <ContentSection title="Comment Demo">
        <Grid
          gap="3"
          columns={{
            initial: '1',
            md: '2',
            lg: '4',
          }}
        >
          {comments.map((c, idx) => (
            <Box key={idx} className="flex flex-col border border-zinc-200 rounded-lg p-4 shadow-sm bg-white">
              <Flex align="center" gap="3" mb="2">
                {/*<IconButton variant="ghost" size="3" aria-label="Commenter">
                  <PersonIcon className="w-5 h-5 text-zinc-600" />
                </IconButton>*/}
                <Heading size="4" className="text-districtrBlue">
                  {c.comment.title}
                </Heading>
              </Flex>
              <Text className="mb-3">{c.comment.comment}</Text>
              <Flex wrap="wrap" gap="2">
                {c.tags?.map((tag) => (
                  <Link
                    href={`/api/comments/tagged/${tag}`}
                    key={tag}
                    className="px-2 py-1 text-sm rounded-full bg-purple-100 text-black"
                  >
                    {tag}
                  </Link>
                ))}
              </Flex>
              <Text className="mt-1 text-gray-400 text-xs text-right">
                {formatDistanceToNow(c.comment.created_at)} ago
              </Text>
            </Box>
          ))}
        </Grid>
      </ContentSection>
    </Flex>
  );
}
