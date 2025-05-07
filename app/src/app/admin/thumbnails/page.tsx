'use client';

import {generateThumbnail} from '@/app/utils/api/apiHandlers/generateThumbnail';
import {Cross2Icon, ReloadIcon} from '@radix-ui/react-icons';
import {Button, Flex, Heading, IconButton, Text, TextField} from '@radix-ui/themes';
import {useState} from 'react';

export default function CmsHome() {
  const [textValue, setTextValue] = useState('');
  const [response, setResponse] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const handleGenerateThumbnail = async () => {
    const response = await generateThumbnail(textValue);
    if (response.message) {
      setResponse(
        `Success: ${response.message}. Your thumbnail make take up to 1 minute to generate; click the reload button to refresh the preview thumbnail.`
      );
      setTimeout(() => {
        setResponse('');
      }, 15000);
      setThumbnails(prev => [...prev, textValue]);
    } else {
      setResponse('Error generating thumbnail');
    }
  };
  const handleDismiss = (documentId: string) => {
    setThumbnails(prev => prev.filter(id => id !== documentId));
  };

  return (
    <Flex direction="column" gap="4">
      <Heading as="h1" size="4">
        Districtr Admin Dashboard: Thumbnails
      </Heading>
      <Text>Generate or update thumbnails for maps</Text>

      <Flex direction="column" gap="4">
        <Text>Generate thumbnails for maps</Text>
        <TextField.Root
          value={textValue}
          onChange={e => setTextValue(e.target.value)}
          placeholder="Enter a map document ID"
        ></TextField.Root>
        <Button onClick={handleGenerateThumbnail}>Generate Thumbnail</Button>
        {response?.length > 0 && <Text>{response}</Text>}
      </Flex>
      <Flex direction="column" gap="4">
        {thumbnails.map(documentId => (
          <ThumbnailImage
            key={documentId}
            documentId={documentId}
            onDismiss={() => handleDismiss(documentId)}
          />
        ))}
      </Flex>
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
