'use client';
import React, {useEffect, useRef, useState} from 'react';
import {GerryDBViewSelector} from '@components/sidebar/GerryDBViewSelector';
import {MapLink, processFile} from '@/app/utils/api/upload';
import {
  Link,
  Flex,
  Heading,
  Table,
  Text,
  Tooltip,
  Blockquote,
  Select,
  Button,
  Spinner,
} from '@radix-ui/themes';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';

export const Uploader: React.FC<{
  newTab?: boolean;
  redirect?: boolean;
  onFinish?: () => void;
}> = ({newTab, redirect, onFinish}) => {
  const [mapLinks, setMapLinks] = useState<MapLink[]>([]);
  const [error, setError] = useState<any>(undefined);
  const [config, setConfig] = useState<{GEOID?: number; ZONE?: number}>({});
  const [file, setFile] = useState<File | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [districtrMap, setDistrictrMap] = useState<DistrictrMap | undefined>(undefined);

  useEffect(() => {
    if (redirect) {
      const newestMap = mapLinks[mapLinks.length - 1];
      if (newestMap) {
        window.location.href = `/map?document_id=${newestMap.document_id}`;
        onFinish?.();
      }
    }
    setError(undefined);
    setConfig({});
    setFile(undefined);
    setIsProcessing(false);
    inputRef.current?.value && (inputRef.current.value = '');
  }, [mapLinks]);

  useEffect(() => {
    setIsProcessing(false);
  }, [error]);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    setFile(file);
    if (districtrMap) {
      setIsProcessing(true);
      processFile({
        file,
        setMapLinks,
        districtrMap,
        setError,
      });
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFile(file);
    if (file && districtrMap) {
      setIsProcessing(true);
      processFile({
        file,
        setMapLinks,
        districtrMap,
        setError,
      });
    }
  };

  const handleRetry = () => {
    if (file && districtrMap) {
      setIsProcessing(true);
      processFile({
        file,
        setMapLinks,
        districtrMap,
        setError,
        // @ts-ignore
        config: config.ZONE !== undefined && config.GEOID !== undefined ? config : undefined,
      });
    }
  };

  return (
    <Flex direction="column" position="relative">
      <Flex
        direction={'column'}
        p="4"
        gapY="4"
        className="bg-white border-[1px] border-dashed border-gray-400 rounded-lg min-w-[200px]"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <GerryDBViewSelector value={districtrMap} onChange={setDistrictrMap} />
        <input
          type="file"
          name="uploader"
          className="hidden"
          id="file-input"
          onChange={handleFileSelected}
          disabled={!districtrMap}
          ref={inputRef}
        />
        <label
          htmlFor="file-input"
          className={`${!districtrMap ? 'bg-gray-200 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white px-4 py-2 rounded cursor-pointer `}
        >
          Choose a file
        </label>
      </Flex>
      <UploadError error={error} config={config} setConfig={setConfig} handleRetry={handleRetry} />
      {!!mapLinks.length && (
        <Flex direction="column" gapY="2" pt="4">
          <Heading size="2">Uploaded maps</Heading>
          <Table.Root className="p-0">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Map</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Link</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Filename</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {mapLinks.map((map, i) => (
                <Table.Row key={`map-uploads-${i}`}>
                  <Table.Cell>{map.name}</Table.Cell>
                  <Table.Cell>
                    <Link
                      href={`/map?document_id=${map.document_id}`}
                      target={newTab ? '_blank' : undefined}
                    >
                      Go to map
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    {map.filename.length > 10 ? (
                      <Tooltip content={map.filename}>
                        <Text>{map.filename.substring(0, 10)}...</Text>
                      </Tooltip>
                    ) : (
                      <Text>{map.filename}</Text>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Flex>
      )}
      {isProcessing && (
        <Flex
          direction="column"
          gapY="2"
          className="absolute inset-0 bg-white bg-opacity-90 size-full"
          justify="center"
          align="center"
        >
          <Spinner />
          <Heading size="2">Processing file...</Heading>
          <Heading size="1">(Please don't close this page or refresh)</Heading>
        </Flex>
      )}
    </Flex>
  );
};

export const UploadError: React.FC<{
  error?: {
    ok: boolean;
    detail: {
      message: string;
      row: string[];
      districtrMap: DistrictrMap;
      expectedPrefix: string;
      receivedState: string;
      receivedPrefix: string;
      expectedState: string;
      headerRow: string[];
    };
  };
  config: {GEOID?: number; ZONE?: number};
  setConfig: React.Dispatch<React.SetStateAction<{GEOID?: number; ZONE?: number}>>;
  handleRetry: () => void;
}> = ({error, config, setConfig, handleRetry}) => {
  if (!error || error.ok) return null;
  console.error(error);

  const handleConfig = (col: 'GEOID' | 'ZONE', index: number) => {
    setConfig(prev => ({
      ...prev,
      [col]: index,
    }));
  };

  switch (error.detail.message) {
    case 'Block GEOID does not match state prefix':
      return (
        <Flex direction="column">
          <Blockquote className="max-w-96 mt-2" color="red">
            <Text>
              Block GEOID <code>{JSON.stringify(error.detail.row[0])}</code> does not match state
              prefix. We expected data for <code>{error.detail.expectedState}</code> (State code:{' '}
              {error.detail.expectedPrefix}) but received data for {error.detail.receivedState}{' '}
              (State code: {error.detail.receivedPrefix})
              <br />
              <br />
              Please choose a plan for {error.detail.receivedState} or make sure your block
              assignments only include IDs for {error.detail.expectedState}.
            </Text>
          </Blockquote>
          <Button onClick={() => handleRetry()}>Retry</Button>
        </Flex>
      );
    case 'Columns are ambiguous':
    case 'Missing columns':
      return (
        <Flex direction="column" gapY="2">
          <Blockquote className="max-w-96 mt-2" color="red">
            <Text>{error.detail.message}.</Text> Please specify columns for the geographic
            identifier (GEOID) and district number (zone) below:
          </Blockquote>
          <Select.Root
            value={`${config.GEOID}`}
            onValueChange={value => handleConfig('GEOID', +value)}
          >
            <Select.Trigger>
              <Text>
                Geographic Identifier{' '}
                {!!config.GEOID && `(${error.detail.headerRow[config.GEOID]})`}
              </Text>
            </Select.Trigger>
            <Select.Content>
              {error.detail.headerRow.map((col, i) => (
                <Select.Item key={i} value={`${i}`}>
                  {col}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Select.Root
            value={`${config.ZONE}`}
            onValueChange={value => handleConfig('ZONE', +value)}
          >
            <Select.Trigger>
              <Text>
                District number {!!config.ZONE && `(${error.detail.headerRow[config.ZONE]})`}
              </Text>
            </Select.Trigger>
            <Select.Content>
              {error.detail.headerRow.map((col, i) => (
                <Select.Item key={i} value={`${i}`}>
                  {col}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Button onClick={() => handleRetry()}>Retry</Button>
        </Flex>
      );

    default:
      return null;
  }
};
