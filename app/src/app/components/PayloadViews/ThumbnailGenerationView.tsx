'use client';
import '@radix-ui/themes/styles.css';
import {usePayloadSession} from '@/app/hooks/usePayloadSession';
import {generateThumbnail} from '@/app/utils/api/apiHandlers/generateThumbnail';
import {Cross2Icon, ReloadIcon} from '@radix-ui/react-icons';
import {
  Blockquote,
  Button,
  Flex,
  Grid,
  Heading,
  IconButton,
  Text,
  TextField,
  Theme,
} from '@radix-ui/themes';
import {useState} from 'react';

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

function ThumbnailGenerationInner() {
  const session = usePayloadSession();
  const [textValue, setTextValue] = useState('');
  const [response, setResponse] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const handleGenerateThumbnail = async () => {
    if (!textValue) {
      setResponse('Please enter a map document ID');
      return;
    }
    if (!session) {
      setResponse('Please login to generate thumbnails');
      return;
    }
    if (thumbnails.includes(textValue)) {
      setResponse('Thumbnail already exists. Dismiss the preview below to re-generate it.');
      return;
    }
    const result = await generateThumbnail(textValue, session);
    if (result.ok) {
      setResponse(
        `Success: ${result.response['message']}. Your thumbnail may take up to 1 minute to generate; click the reload button to refresh the preview thumbnail.`
      );
      setTimeout(() => {
        setResponse('');
      }, 15000);
      setThumbnails(prev => [...prev, result.response.public_id.toString()]);
    } else {
      setResponse(`Error generating thumbnail: ${result.error}`);
    }
  };

  const handleDismiss = (documentId: string) => {
    setThumbnails(prev => prev.filter(id => id !== documentId));
  };

  return (
    <Flex direction="column" gap="4">
      <Heading as="h1" size="4">
        Thumbnail Generation
      </Heading>
      <Text>Generate or update thumbnails for maps</Text>

      <Flex direction="row" gap="4">
        <TextField.Root
          value={textValue}
          onChange={e => setTextValue(e.target.value)}
          placeholder="Enter a map document ID"
          className="flex-grow"
        />
        <Button onClick={handleGenerateThumbnail}>Generate Thumbnail</Button>
      </Flex>
      {response?.length > 0 && <Blockquote>{response}</Blockquote>}
      <Grid columns={{initial: '1', md: '2', lg: '3'}} gap="4">
        {thumbnails.map(documentId => (
          <ThumbnailImage
            key={documentId}
            documentId={documentId}
            onDismiss={() => handleDismiss(documentId)}
          />
        ))}
      </Grid>
    </Flex>
  );
}

export default function ThumbnailGenerationView() {
  return (
    <div className="payload-custom-view" style={{isolation: 'isolate'}}>
      <Theme accentColor="indigo" radius="medium" scaling="95%">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <ThumbnailGenerationInner />
        </div>
      </Theme>
    </div>
  );
}
