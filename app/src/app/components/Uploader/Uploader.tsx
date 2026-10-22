'use client';
import React, {useEffect, useRef, useState} from 'react';
import {MapLink, processFile} from '@/app/utils/api/upload';
import {Link, Flex, Text, Spinner, Callout, Button, Card} from '@radix-ui/themes';
import {ExclamationTriangleIcon, InfoCircledIcon, UploadIcon} from '@radix-ui/react-icons';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {routeManager} from '@/app/utils/map/mapUrlRoute';
import {editPath} from '@/app/utils/map/editUrl';
import {MAP_ROUTES} from '@constants/document/routes';
import {MAP_TYPES} from '@constants/document/types';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {formatErrorDetail} from '@/app/utils/api/factory';

const MAX_FILES = 10;

type Upload = {filename: string; mapLink?: MapLink; error?: string};

// Skipped GEOIDs or remapped zone labels need the user to read the warning before opening the map.
const needsReview = (mapLink: MapLink) =>
  Boolean(mapLink.skipped_geo_ids?.length || mapLink.zone_label_remapping);

export const Uploader: React.FC<{
  newTab?: boolean;
  redirect?: boolean;
  onFinish?: () => void;
}> = ({newTab, redirect, onFinish}) => {
  const routePrefix = routeManager.mapUrlRoute;
  const isCoiRoute = routePrefix === MAP_ROUTES.COI;
  const documentMapType = isCoiRoute ? MAP_TYPES.COMMUNITY : MAP_TYPES.DEFAULT;
  const [availableMaps, setAvailableMaps] = useState<DistrictrMap[] | undefined>(undefined);
  const [mapsError, setMapsError] = useState<string>();
  const [selectionError, setSelectionError] = useState<string>();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Custom (num_districts_modifiable) maps live in the 'custom' group, not
    // 'states', so they don't clutter the public map picker. CSV imports
    // target custom maps exclusively.
    getAvailableDistrictrMaps({group: 'custom'}).then(custom => {
      if (custom.ok) {
        setAvailableMaps(custom.response);
      } else {
        setMapsError(formatErrorDetail(custom.error.detail) || 'request failed');
      }
    });
  }, []);

  const pendingIndex = uploads.findIndex(u => u.mapLink === undefined && u.error === undefined);
  const isProcessing = pendingIndex !== -1;
  const canUpload = availableMaps !== undefined && !isProcessing;

  const handleFiles = async (files: File[]) => {
    if (!files.length || !availableMaps || isProcessing) return;
    if (files.length > MAX_FILES) {
      setSelectionError(
        `You can upload up to ${MAX_FILES} files at a time (${files.length} selected).`
      );
      return;
    }
    setSelectionError(undefined);
    setUploads(files.map(file => ({filename: file.name})));
    // ponytail: one file at a time so a batch of large plans doesn't hit the API at once;
    // a small concurrency pool if batches feel slow.
    for (const [i, file] of files.entries()) {
      const result: Partial<Upload> = await processFile({file, availableMaps, documentMapType})
        .then(mapLink => ({mapLink}))
        .catch((e: unknown) => ({error: e instanceof Error ? e.message : String(e)}));
      setUploads(prev => prev.map((u, j) => (j === i ? {...u, ...result} : u)));
      if (redirect && files.length === 1 && result.mapLink && !needsReview(result.mapLink)) {
        window.location.href = editPath(
          routePrefix,
          result.mapLink.document_id,
          result.mapLink.public_id ?? null
        );
        onFinish?.();
      }
    }
  };

  // In the modal, following one link navigates away from the rest, so batches open in new tabs.
  const linkTarget = newTab || uploads.length > 1 ? '_blank' : undefined;

  return (
    <Flex direction="column" gapY="4">
      <Flex
        direction="column"
        p="4"
        gapY="4"
        className="bg-white border-[1px] border-dashed border-gray-400 rounded-lg"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          handleFiles([...e.dataTransfer.files]);
        }}
      >
        <Text size="2" color="gray">
          Upload a CSV with 2020 census block GEOIDs in the first column and District numbers in the
          second column, like the following:
        </Text>
        <Flex direction="column" className="bg-gray-50 rounded p-2 font-mono text-xs text-gray-600">
          <Text as="p">GEOID20,District</Text>
          <Text as="p">440070112002000,1</Text>
          <Text as="p">440070112002001,1</Text>
          <Text as="p">440070112002002,1</Text>
          <Text as="p" color="gray">
            ...
          </Text>
        </Flex>
        <Text size="2" color="gray">
          Still not sure of the format?{' '}
          <Link
            href="https://tilesets1.cdn.districtr.org/reference/example-block-assignments-RI.csv"
            target="_blank"
          >
            Download an example
          </Link>
          .
        </Text>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          ref={inputRef}
          onChange={e => {
            const files = [...(e.target.files ?? [])];
            // Clear so re-selecting the same files fires onChange again.
            e.target.value = '';
            handleFiles(files);
          }}
        />
        <Flex direction="column" align="center" gapY="2">
          <Button size="3" disabled={!canUpload} onClick={() => inputRef.current?.click()}>
            {availableMaps === undefined && !mapsError ? <Spinner /> : <UploadIcon />}
            {availableMaps === undefined && !mapsError ? 'Loading maps…' : 'Choose files'}
          </Button>
          <Text size="1" color="gray">
            or drop up to {MAX_FILES} CSV files here
          </Text>
        </Flex>
      </Flex>
      {(mapsError || selectionError) && (
        <Callout.Root color="red" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            {mapsError ? `Couldn't load the list of maps: ${mapsError}` : selectionError}
          </Callout.Text>
        </Callout.Root>
      )}
      {isProcessing && (
        <Text size="2" color="gray">
          Uploading {pendingIndex + 1} of {uploads.length}. Please don&apos;t close or refresh this
          page.
        </Text>
      )}
      {uploads.map((upload, i) => (
        <UploadCard
          key={i}
          upload={upload}
          queued={isProcessing && i > pendingIndex}
          href={
            upload.mapLink &&
            editPath(routePrefix, upload.mapLink.document_id, upload.mapLink.public_id ?? null)
          }
          target={linkTarget}
        />
      ))}
    </Flex>
  );
};

const UploadCard: React.FC<{
  upload: Upload;
  queued: boolean;
  href?: string;
  target?: string;
}> = ({upload: {filename, mapLink, error}, queued, href, target}) => (
  <Card size="1">
    <Flex direction="column" gapY="2">
      <Flex align="center" justify="between" gapX="3">
        <Flex direction="column" className="min-w-0">
          <Text size="2" weight="medium" truncate>
            {filename}
          </Text>
          {mapLink && (
            <Text size="1" color="gray">
              {mapLink.name}
            </Text>
          )}
        </Flex>
        {mapLink && href ? (
          <Button asChild size="2">
            <a href={href} target={target} rel={target ? 'noopener noreferrer' : undefined}>
              Open map
            </a>
          </Button>
        ) : error ? (
          <Text size="2" color="red" className="shrink-0">
            Failed
          </Text>
        ) : (
          <Flex align="center" gapX="2" className="shrink-0">
            {!queued && <Spinner />}
            <Text size="2" color="gray">
              {queued ? 'Queued' : 'Processing…'}
            </Text>
          </Flex>
        )}
      </Flex>
      {error && (
        <Text size="2" color="red">
          {error}
        </Text>
      )}
      {mapLink?.skipped_geo_ids && mapLink.skipped_geo_ids.length > 0 && (
        <Callout.Root color="orange" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            {mapLink.skipped_geo_ids.length} GEOID
            {mapLink.skipped_geo_ids.length === 1 ? '' : 's'} not found in the map&apos;s geography
            and skipped: {mapLink.skipped_geo_ids.slice(0, 5).join(', ')}
            {mapLink.skipped_geo_ids.length > 5
              ? ` and ${mapLink.skipped_geo_ids.length - 5} more`
              : ''}
            .
          </Callout.Text>
        </Callout.Root>
      )}
      {mapLink?.zone_label_remapping && (
        <Callout.Root color="blue" size="1">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            The following district labels could not be used directly and were assigned new district
            numbers:
          </Callout.Text>
          <Callout.Text>
            {Object.entries(mapLink.zone_label_remapping)
              .map(([original, zone]) => `District "${original || '(blank)'}" → District "${zone}"`)
              .join(', ')}
          </Callout.Text>
          <Callout.Text color="gray">
            The original labels are saved as district comments — you can find them in the district
            panel in the draw mode.
          </Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  </Card>
);
