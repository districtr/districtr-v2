'use client';
import {
  Button,
  Badge,
  Text,
  DropdownMenu,
  Flex,
  Heading,
  IconButton,
  Link,
  Box,
  Tooltip,
  Tabs,
  TextField,
  Popover,
  TextArea,
} from '@radix-ui/themes';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useMapStore} from '@/app/store/mapStore';
import {MAX_TITLE_LENGTH} from '@/app/utils/language';
import {useEffect, useState} from 'react';
import {DocumentMetadata, DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {Pencil1Icon} from '@radix-ui/react-icons';

export const MapHeader: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMetadata = useMapMetadata(mapDocument?.document_id);

  const mapTableName = useMapStore(
    state =>
      state.userMaps.find(userMap => userMap.document_id === state.mapDocument?.document_id)
        ?.name ?? ''
  );
  return (
    <Flex direction="row" align="center" gapX="2">
      {/*map name */}
      {/* <Button variant="ghost" onClick={() => {}}>
        <Text size="3" className="text-black-500">
        </Text>
      </Button> */}
      <MapTitleDisplay mapMetadata={mapMetadata} mapDocument={mapDocument} />
      {/*map slug */}
      {/*source table name */}
      <Text size="2" className="text-gray-500">
        {mapTableName || ''}
      </Text>
    </Flex>
  );
};

export const MapTitleDisplay: React.FC<{
  mapMetadata: DocumentMetadata | null;
  mapDocument: DocumentObject | null;
}> = ({mapMetadata, mapDocument}) => {
  const [mapTitleInner, setMapTitleInner] = useState<string>('');
  const _mapName = mapMetadata?.name ?? mapDocument?.map_metadata?.name ?? '';

  const isTruncated = _mapName.length > MAX_TITLE_LENGTH;
  const mapName = isTruncated ? `${_mapName.slice(0, MAX_TITLE_LENGTH)}...` : _mapName;
  const editing = mapDocument?.access === 'edit' && mapDocument?.status === 'checked_out';

  const handleChangeMapName = async () => {
    if (mapTitleInner === _mapName || !mapMetadata) {
      return;
    }
    await saveMap({
      ...mapMetadata,
      name: mapTitleInner,
    });
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleChangeMapName();
    }
  };

  useEffect(() => {
    setMapTitleInner(_mapName);
  }, [_mapName]);
  if (!mapMetadata || !mapDocument) return null;
  if (!editing && !isTruncated) {
    return <Text size="2">{mapName}</Text>;
  }

  if (!editing && isTruncated) {
    return (
      <Tooltip content={_mapName}>
        <Flex align="center" gapX="1" direction="row">
          <Text size="2">{mapName}</Text>
        </Flex>
      </Tooltip>
    );
  }
  if (editing) {
    return (
      <Popover.Root>
        <Popover.Trigger>
          <Flex align="center" gapX="1" direction="row" className="cursor-pointer">
            <Tooltip content={_mapName} className={`${isTruncated ? 'w-full' : 'w-fit'}`}>
              <Flex align="center" gapX="1" direction="row">
                <Text size="2">{mapName}</Text>
                <Pencil1Icon />
              </Flex>
            </Tooltip>
          </Flex>
        </Popover.Trigger>
        <Popover.Content>
          <Flex direction="column" gap="2">
            <Text size="2">Edit Map Name</Text>
            <TextArea
              value={mapTitleInner}
              onChange={e => setMapTitleInner(e.target.value)}
              onBlur={handleChangeMapName}
              className={`h-auto ${isTruncated ? 'w-full' : 'w-fit'}`}
            >
              {!isTruncated && (
                <TextField.Slot>
                  <Pencil1Icon />
                </TextField.Slot>
              )}
            </TextArea>
          </Flex>{' '}
          <Popover.Close>
            <Flex direction="row" gap="2" my="2">
              <Button size="1" variant="surface" color="green" onClick={handleChangeMapName}>
                Submit
              </Button>
              <Button
                size="1"
                variant="outline"
                color="gray"
                onClick={() => setMapTitleInner(_mapName)}
              >
                Cancel
              </Button>
            </Flex>
          </Popover.Close>
        </Popover.Content>
      </Popover.Root>
    );
  }
  return null;
};
