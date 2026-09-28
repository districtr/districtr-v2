import StreamRenderer from '@/app/components/RichTextRenderer/StreamRenderer';
import {getCMSPreview} from '@/app/utils/api/cmsContent';
import {Box, Flex, Heading, Text} from '@radix-ui/themes';

// Renders a draft snapshot minted by the Wagtail editor's Preview button.
// Same layout chrome and StreamRenderer as the live pages, so what the
// editor sees is what publishing will produce.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Draft preview',
  robots: {index: false, follow: false},
};

export default async function Page({params}: {params: Promise<{token: string}>}) {
  const {token} = await params;
  const cmsData = await getCMSPreview(token);

  if (!cmsData?.content) {
    return (
      <Flex width="100%" justify="center" py="9">
        <Text>This preview has expired — reopen it from the editor.</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" width="100%" py="6">
      <Box className="bg-amber-100 border border-amber-300 rounded-md p-2 text-center mb-4">
        <Text size="2" weight="bold">
          Draft preview — this version is not published
        </Text>
      </Box>
      <Heading as="h1" size="6" mb="4">
        {cmsData.content.title}
      </Heading>
      <StreamRenderer body={cmsData.content.body} className="my-4" />
    </Flex>
  );
}
