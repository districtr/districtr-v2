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
  Badge,
} from '@radix-ui/themes';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';

export const Uploader: React.FC<{
  newTab?: boolean;
  redirect?: boolean;
  onFinish?: () => void;
}> = ({newTab, redirect, onFinish}) => {
  type UploadConfig = {GEOID: number; ZONE: number};
  type UploadProgress = {
    stage: 'idle' | 'parsing' | 'validating' | 'uploading' | 'done';
    message: string;
    totalRows?: number;
    processedRows?: number;
  };

  const [mapLinks, setMapLinks] = useState<MapLink[]>([]);
  const [error, setError] = useState<any>(undefined);
  const [config, setConfig] = useState<{GEOID?: number; ZONE?: number}>({});
  const [file, setFile] = useState<File | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'idle',
    message: 'Waiting for file',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const [districtrMap, setDistrictrMap] = useState<DistrictrMap | undefined>(undefined);

  useEffect(() => {
    if (redirect) {
      const newestMap = mapLinks[mapLinks.length - 1];
      if (newestMap) {
        window.location.href = `/map/edit/${newestMap.document_id}`;
        onFinish?.();
      }
    }
    setError(undefined);
    setConfig({});
    setFile(undefined);
    setIsProcessing(false);
    setUploadProgress({
      stage: 'idle',
      message: 'Waiting for file',
    });
    inputRef.current?.value && (inputRef.current.value = '');
  }, [mapLinks]);

  useEffect(() => {
    if (!error) return;
    setIsProcessing(false);
    if (!error?.ok && error?.detail?.suggestedIndices) {
      setConfig((prev: {GEOID?: number; ZONE?: number}) => ({
        ...error.detail.suggestedIndices,
        ...prev,
      }));
    }
  }, [error]);

  const handleProgress = (progress: UploadProgress) => {
    setUploadProgress(progress);
    setIsProcessing(progress.stage !== 'done' && progress.stage !== 'idle');
  };

  const runUpload = (uploadFile?: File, overrideConfig?: UploadConfig) => {
    if (!uploadFile || !districtrMap) return;
    setError(undefined);
    setIsProcessing(true);
    setUploadProgress({
      stage: 'parsing',
      message: 'Parsing CSV file',
    });

    processFile({
      file: uploadFile,
      setMapLinks,
      districtrMap,
      setError,
      config: overrideConfig,
      onProgress: handleProgress,
    }).catch(() => {
      setIsProcessing(false);
      setUploadProgress({
        stage: 'done',
        message: 'Upload failed',
      });
    });
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    setFile(droppedFile);
    runUpload(droppedFile);
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(selectedFile);
    runUpload(selectedFile);
  };

  const handleRetry = () => {
    if (config.GEOID !== undefined && config.ZONE !== undefined) {
      runUpload(file, {GEOID: config.GEOID, ZONE: config.ZONE});
      return;
    }
    runUpload(file);
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
          disabled={!districtrMap || isProcessing}
          ref={inputRef}
          accept=".csv,text/csv"
        />
        <label
          htmlFor="file-input"
          className={`${!districtrMap || isProcessing ? 'bg-gray-200 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white px-4 py-2 rounded cursor-pointer text-center`}
        >
          {isProcessing ? 'Import in progress...' : 'Choose CSV file'}
        </label>
        <Text size="2" color="gray">
          {!districtrMap
            ? 'Step 1: Select a geography first.'
            : !file
              ? 'Step 2: Choose a CSV with GEOID and district columns.'
              : `Selected file: ${file.name}`}
        </Text>
        {uploadProgress.stage !== 'idle' && (
          <Flex align="center" gapX="2" className="text-blue-700">
            <Badge color="blue" variant="soft">
              {uploadProgress.stage.toUpperCase()}
            </Badge>
            <Text size="2">{uploadProgress.message}</Text>
          </Flex>
        )}
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
                      href={`/map/edit/${map.document_id}`}
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
          <Heading size="2">{uploadProgress.message || 'Processing file...'}</Heading>
          {!!uploadProgress.totalRows && (
            <Text size="2">Rows detected: {uploadProgress.totalRows.toLocaleString()}</Text>
          )}
          <Heading size="1">(Please don&apos;t close this page or refresh)</Heading>
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
      row?: string[];
      districtrMap?: DistrictrMap;
      expectedPrefix?: string;
      receivedState?: string;
      receivedPrefix?: string;
      expectedState?: string;
      headerRow?: string[];
      missingColumns?: string[];
      suggestedIndices?: {GEOID?: number; ZONE?: number};
      summary?: {
        total_rows: number;
        inserted_assignments: number;
        null_zone_rows: number;
        invalid_zone_rows: number;
        invalid_geoid_rows: number;
        empty_geoid_rows: number;
      };
    };
  };
  config: {GEOID?: number; ZONE?: number};
  setConfig: React.Dispatch<React.SetStateAction<{GEOID?: number; ZONE?: number}>>;
  handleRetry: () => void;
}> = ({error, config, setConfig, handleRetry}) => {
  if (!error || error.ok) return null;
  console.error(error);
  const headerRow = error.detail.headerRow ?? [];
  const canRetryWithConfig = config.GEOID !== undefined && config.ZONE !== undefined;

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
              Block GEOID <code>{JSON.stringify(error.detail.row?.[0])}</code> does not match state
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
    case 'Upload size exceeds maximum allowed limit (914231 records)':
      return (
        <Blockquote className="max-w-96 mt-2" color="red">
          <Text>{error.detail.message}.</Text> Please upload a CSV with fewer assignments.
        </Blockquote>
      );
    case 'Columns are ambiguous':
    case 'Missing columns':
      return (
        <Flex direction="column" gapY="2">
          <Blockquote className="max-w-96 mt-2" color="red">
            <Text>{error.detail.message}.</Text> Please specify columns for the geographic
            identifier (GEOID) and district number (zone) below:
          </Blockquote>
          {!!error.detail.missingColumns?.length && (
            <Text size="2" color="gray">
              Missing fields detected: {error.detail.missingColumns.join(', ')}
            </Text>
          )}
          <Select.Root
            value={config.GEOID !== undefined ? `${config.GEOID}` : undefined}
            onValueChange={value => handleConfig('GEOID', +value)}
          >
            <Select.Trigger>
              <Text>
                Geographic Identifier{' '}
                {config.GEOID !== undefined && `(${headerRow[config.GEOID]})`}
              </Text>
            </Select.Trigger>
            <Select.Content>
              {headerRow.map((col, i) => (
                <Select.Item key={i} value={`${i}`}>
                  {col}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Select.Root
            value={config.ZONE !== undefined ? `${config.ZONE}` : undefined}
            onValueChange={value => handleConfig('ZONE', +value)}
          >
            <Select.Trigger>
              <Text>
                District number {config.ZONE !== undefined && `(${headerRow[config.ZONE]})`}
              </Text>
            </Select.Trigger>
            <Select.Content>
              {headerRow.map((col, i) => (
                <Select.Item key={i} value={`${i}`}>
                  {col}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Button onClick={() => handleRetry()} disabled={!canRetryWithConfig}>
            Retry
          </Button>
        </Flex>
      );

    default:
      if (
        error.detail.message === 'Upload contains rows that could not be safely imported' &&
        error.detail.summary
      ) {
        const summary = error.detail.summary;
        return (
          <Blockquote className="max-w-96 mt-2" color="red">
            <Text>
              {error.detail.message}. Valid assignments found: {summary.inserted_assignments} of{' '}
              {summary.total_rows}. Invalid GEOIDs: {summary.invalid_geoid_rows}. Invalid zones:{' '}
              {summary.invalid_zone_rows}. Empty GEOIDs: {summary.empty_geoid_rows}.
            </Text>
          </Blockquote>
        );
      }
      return (
        <Blockquote className="max-w-96 mt-2" color="red">
          <Text>{error.detail.message}.</Text>
        </Blockquote>
      );
  }
};
