import {Flex, Heading} from '@radix-ui/themes';
import {CommentList} from '@/app/components/Forms/CommentList';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {getDocumentComments} from '@/app/utils/api/apiHandlers/getComments';

export default async function DevPage({params}: {params: Promise<{slug: string}>}) {
  const [{slug}] = await Promise.all([params]);
  const comments = await getDocumentComments(slug);

  return (
    <Flex direction="column" width="100%">
      <Heading as="h1" size="6" mb="4">
        Latest Comments
      </Heading>
      <ContentSection title="Comment Demo">
        <CommentList comments={comments} />
      </ContentSection>
    </Flex>
  );
}
