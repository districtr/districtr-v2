'use client';
import React, {useEffect, useRef, useState} from 'react';
import {MapLink, processFile} from '@/app/utils/api/upload';
import {Link, Flex, Heading, Text, Blockquote, Spinner, Callout} from '@radix-ui/themes';
import {ExclamationTriangleIcon, InfoCircledIcon} from '@radix-ui/react-icons';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {routeManager} from '@/app/utils/map/mapUrlRoute';
import {MAP_ROUTES} from '@constants/document/routes';
import {MAP_TYPES} from '@constants/document/types';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';

export const Uploader: React.FC<{
  newTab?: boolean;
  redirect?: boolean;
  onFinish?: () => void;
}> = ({newTab, redirect, onFinish}) => {
  const routePrefix = routeManager.mapUrlRoute;
  const isCoiRoute = routePrefix === MAP_ROUTES.COI;
  const documentMapType = isCoiRoute ? MAP_TYPES.COMMUNITY : MAP_TYPES.DEFAULT;
  const [mapLinks, setMapLinks] = useState<MapLink[]>([]);
  const [error, setError] = useState<any>(undefined);
  const [, setFile] = useState<File | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableMaps, setAvailableMaps] = useState<DistrictrMap[] | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAvailableDistrictrMaps({}).then(result => {
      if (result.ok) setAvailableMaps(result.response);
    });
  }, []);

  useEffect(() => {
    if (redirect) {
      const newestMap = mapLinks[mapLinks.length - 1];
      // Don't auto-redirect when the user needs to review warnings — skipped
      // GEOIDs or remapped zone labels both require a manual "Continue" click.
      const needsReview = newestMap?.skipped_geo_ids?.length || newestMap?.zone_label_remapping;
      if (newestMap && !needsReview) {
        window.location.href = `/${routePrefix}/edit/${newestMap.document_id}`;
        onFinish?.();
      }
    }
    setError(undefined);
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
    const droppedFile = event.dataTransfer.files?.[0];
    setFile(droppedFile);
    if (droppedFile && availableMaps) {
      setIsProcessing(true);
      processFile({
        file: droppedFile,
        setMapLinks,
        availableMaps,
        documentMapType,
        setError,
      });
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(selectedFile);
    if (selectedFile && availableMaps) {
      setIsProcessing(true);
      processFile({
        file: selectedFile,
        setMapLinks,
        availableMaps,
        documentMapType,
        setError,
      });
    }
  };

  const mapsLoaded = availableMaps !== undefined;

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
        <Text size="2" color="gray">
          Upload a CSV with census block GEOIDs in the first column and zone numbers in the second.
          The congressional map will be inferred from the state.
        </Text>
        <input
          type="file"
          name="uploader"
          className="hidden"
          id="file-input"
          onChange={handleFileSelected}
          disabled={!mapsLoaded}
          ref={inputRef}
        />
        <label
          htmlFor="file-input"
          className={`${!mapsLoaded ? 'bg-gray-200 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white px-4 py-2 rounded cursor-pointer`}
        >
          {mapsLoaded ? 'Choose a file' : 'Loading maps…'}
        </label>
      </Flex>
      <UploadError error={error} />
      {!!mapLinks.length && (
        <Flex direction="column" gapY="3" pt="4">
          {mapLinks.map((map, i) => (
            <Flex key={`map-uploads-${i}`} direction="column" gapY="2">
              {map.skipped_geo_ids && map.skipped_geo_ids.length > 0 && (
                <Callout.Root color="orange" size="1">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    {map.skipped_geo_ids.length} GEOID
                    {map.skipped_geo_ids.length === 1 ? '' : 's'} not found in the map&apos;s
                    geography and skipped: {map.skipped_geo_ids.slice(0, 5).join(', ')}
                    {map.skipped_geo_ids.length > 5
                      ? ` and ${map.skipped_geo_ids.length - 5} more`
                      : ''}
                    .
                  </Callout.Text>
                </Callout.Root>
              )}
              {map.zone_label_remapping && (
                <Callout.Root color="blue" size="1">
                  <Callout.Icon>
                    <InfoCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    <Text as="p" mb="1">
                      The following zone labels were not numeric and have been assigned new zone
                      numbers:
                    </Text>
                    <Text as="p" mb="1">
                      {Object.entries(map.zone_label_remapping)
                        .map(([original, zone]) => `"${original || '(blank)'}" → Zone ${zone}`)
                        .join(', ')}
                    </Text>
                    <Text as="p" color="gray">
                      The original labels are saved as district comments — you can find them in each
                      district&apos;s comment panel.
                    </Text>
                  </Callout.Text>
                </Callout.Root>
              )}
              <Link
                href={`/${routePrefix}/edit/${map.document_id}`}
                target={newTab ? '_blank' : undefined}
                className="self-start"
              >
                <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
                  Continue to map
                </button>
              </Link>
            </Flex>
          ))}
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
          <Heading size="1">(Please don&apos;t close this page or refresh)</Heading>
        </Flex>
      )}
    </Flex>
  );
};

export const UploadError: React.FC<{
  error?: {
    ok: boolean;
    detail: {message: string};
  };
}> = ({error}) => {
  if (!error || error.ok) return null;
  console.error(error);
  return (
    <Blockquote className="max-w-96 mt-2" color="red">
      <Text>{error.detail.message}</Text>
    </Blockquote>
  );
};
