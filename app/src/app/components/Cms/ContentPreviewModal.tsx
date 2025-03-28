import {Box, Button, Dialog, Flex, Heading} from '@radix-ui/themes';
import dynamic from 'next/dynamic';
import {useCmsFormStore} from '@/app/store/cmsFormStore';

const RichTextPreview = dynamic(() => import('@/app/components/RichTextRenderer/RichTextRenderer'), {ssr: false});

export const ContentPreviewModal: React.FC<{}> = () => {
  const previewData = useCmsFormStore(state => state.previewData);
  const setPreviewData = useCmsFormStore(state => state.setPreviewData);
  if (!previewData) {
    return null;
  }

  {
    /* Preview Modal */
  }
  return (
    <Dialog.Root open={true} onOpenChange={() => setPreviewData(null)}>
      <Dialog.Content>
        <Flex direction="column" justify="between">
          <Heading as="h2">{previewData.title}</Heading>
        </Flex>

        <Box className="border-t pt-4">
          <RichTextPreview content={previewData.body} />
        </Box>

        <Flex direction="row" justify="end" gapX="2">
          <Button variant="outline" onClick={() => setPreviewData(null)}>
            Close
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
