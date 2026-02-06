'use client';

import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {generateThumbnail} from '@/app/utils/api/apiHandlers/generateThumbnail';
import {Cross2Icon, ReloadIcon} from '@radix-ui/react-icons';
import {
  Button,
  Callout,
  Flex,
  Grid,
  Heading,
  IconButton,
  Text,
  TextField,
} from '@radix-ui/themes';
import {useState} from 'react';

export default function ThumbnailsPage() {
  const {session} = useCmsFormStore();
  const [textValue, setTextValue] = useState('');
  const [response, setResponse] = useState<{message: string; type: 'success' | 'error'} | null>(
    null
  );
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const handleGenerateThumbnail = async () => {
    if (!textValue) {
      setResponse({message: 'Please enter a map document ID.', type: 'error'});
      return;
    }
    if (!session) {
      setResponse({message: 'Please log in to generate thumbnails.', type: 'error'});
      return;
    }
    if (thumbnails.includes(textValue)) {
      setResponse({
        message: 'Thumbnail already exists. Dismiss the preview below to re-generate it.',
        type: 'error',
      });
      return;
    }
    const result = await generateThumbnail(textValue, session);
    if (result.ok) {
      setResponse({
        message: `${result.response['message']}. Your thumbnail may take up to 1 minute to generate; click the reload button to refresh the preview.`,
        type: 'success',
      });
      setThumbnails(prev => [...prev, result.response.public_id.toString()]);
      setTextValue('');
    } else {
      setResponse({message: `Error generating thumbnail: ${result.error}`, type: 'error'});
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGenerateThumbnail();
    }
  };

  const handleDismiss = (documentId: string) => {
    setThumbnails(prev => prev.filter(id => id !== documentId));
  };

  return (
    <Flex direction="column" gap="4">
      <div>
        <Heading as="h1" size="6">
          Thumbnails
        </Heading>
        <Text size="2" className="text-gray-500">
          Generate or update thumbnails for maps
        </Text>
      </div>

      <Flex direction="row" gap="2" align="end">
        <Flex direction="column" gap="1" className="flex-grow">
          <Text as="label" size="2" weight="medium" htmlFor="document-id">
            Map Document ID
          </Text>
          <TextField.Root
            id="document-id"
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. abc123"
          />
        </Flex>
        <Button onClick={handleGenerateThumbnail}>Generate</Button>
      </Flex>

      {response && (
        <Callout.Root color={response.type === 'success' ? 'green' : 'red'}>
          <Callout.Text>{response.message}</Callout.Text>
          <IconButton
            variant="ghost"
            color="gray"
            size="1"
            onClick={() => setResponse(null)}
            className="absolute top-2 right-2"
          >
            <Cross2Icon />
          </IconButton>
        </Callout.Root>
      )}

      {thumbnails.length > 0 && (
        <Grid
          columns={{
            initial: '1',
            md: '2',
            lg: '3',
          }}
          gap="4"
        >
          {thumbnails.map(documentId => (
            <ThumbnailImage
              key={documentId}
              documentId={documentId}
              onDismiss={() => handleDismiss(documentId)}
            />
          ))}
        </Grid>
      )}
    </Flex>
  );
}

const ThumbnailImage: React.FC<{
  documentId: string;
  onDismiss: () => void;
}> = ({documentId, onDismiss}) => {
  const baseUrl = `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/thumbnails/${documentId}.png`;
  const [url, setUrl] = useState(baseUrl);
  const handleRefresh = () => {
    setUrl(`${baseUrl}?${Date.now()}`);
  };
  return (
    <Flex direction="column" gap="4" className="border border-gray-300 rounded-md p-4">
      <img src={url} alt="Thumbnail" width={320} height={180} />
      <Text>{documentId}</Text>
      <Flex direction="row" gap="2">
        <IconButton onClick={handleRefresh}>
          <ReloadIcon />
        </IconButton>
        <IconButton onClick={onDismiss}>
          <Cross2Icon />
        </IconButton>
      </Flex>
    </Flex>
  );
};
