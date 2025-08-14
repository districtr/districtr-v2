'use client';
import {useFormState} from '@/app/store/formState';
import {useMapStore} from '@/app/store/mapStore';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {TILESET_URL} from '@/app/utils/api/constants';
import {queryClient} from '@/app/utils/api/queryClient';
import {
  Blockquote,
  Box,
  Button,
  Flex,
  ScrollArea,
  Spinner,
  Switch,
  Text,
  TextField,
} from '@radix-ui/themes';
import {QueryClientProvider, useMutation} from '@tanstack/react-query';
import {useEffect, useState} from 'react';

interface MapSelectorProps {
  allowListModules: string[];
}

const MapSelectorInner: React.FC<MapSelectorProps> = ({allowListModules}) => {
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [selectedMap, setSelectedMap] = useState<DocumentObject | null>(null);
  const [notification, setNotification] = useState<null | {
    type: 'error' | 'success';
    message: string;
  }>(null);
  const [mapId, setMapId] = useState('');
  const formStateMapId = useFormState(state => state.comment.document_id);
  const userMaps = useMapStore(state =>
    state.userMaps.filter(
      map => !allowListModules?.length || allowListModules.includes(map.map_module ?? '')
    )
  );
  const setFormState = useFormState(state => state.setFormState);
  const validateMap = async (mapId: string) => {
    // take the slash and then the last characters after the slash
    const urlStrippedId = mapId.split('/').pop();

    const document = await getDocument(urlStrippedId);

    if (!document) {
      throw new Error('Document not found. Please check your map ID and try again.');
    }
    if (!allowListModules.includes(document.map_module ?? '')) {
      throw new Error(
        `Please make sure your map is in the list of allowed modules: ${allowListModules.join(', ')}`
      );
    }
    if (document.map_metadata.draft_status !== 'ready_to_share') {
      throw new Error(
        'Please make sure your map is marked as "ready to share" in the map editor. You can update this in the "Save and share" menu or using the button next to the map title on the top of the map editor.'
      );
    }
    return document;
  };

  const {isPending, mutate} = useMutation({
    mutationFn: validateMap,
    onSuccess: data => {
      setSelectedMap(data);
      setNotification({
        type: 'success',
        message: 'Map validated successfully',
      });
      setMapId(data.document_id);
      setFormState('comment', 'document_id', data.document_id);
    },
    onError: error => {
      setNotification({
        type: 'error',
        message: error.message,
      });
    },
  });

  // clear on reset/submit
  useEffect(() => {
    if (formStateMapId !== mapId) {
      setMapId(formStateMapId ?? '');
      setSelectedMap(null);
    }
  }, [formStateMapId]);

  return (
    <Flex direction="column" gap="2" position="relative" width="100%">
      {isPending && (
        <Box position="absolute" top="0" left="0" right="0" bottom="0" className="bg-black/50">
          <Flex justify="center" align="center" height="100%">
            <Spinner />
          </Flex>
        </Box>
      )}
      <Flex direction="row" gap="2" align="center">
        <Switch checked={showMapSelector} onCheckedChange={setShowMapSelector} />
        <Text as="label" size="2" weight="medium" id="map-selector">
          Include a link to your map?
        </Text>
      </Flex>
      <Flex direction="row" gap="2" align="center" onClick={() => setShowMapSelector(true)}>
        <Box position="relative" flexGrow="1">
          <TextField.Root
            type="text"
            disabled={!showMapSelector}
            value={mapId}
            color={selectedMap?.document_id === mapId ? 'green' : 'gray'}
            onChange={e => setMapId(e.target.value)}
            onFocus={() => setShowMapOptions(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowMapOptions(false);
              }, 100);
            }}
            placeholder="Include a link to your map"
          />
          {showMapOptions && (
            <Box
              position="absolute"
              top="100%"
              right="0"
              bottom="0"
              className="bg-white shadow-md"
              maxHeight="max(140px, 30vh)"
              height="min-content"
              width="100%"
            >
              <ScrollArea size="1" type="auto" scrollbars="vertical" style={{height: '100%'}}>
                {userMaps.map(map => (
                  <Button
                    key={map.document_id}
                    variant="outline"
                    size="3"
                    onClick={e => {
                      e.preventDefault();
                      setMapId(map.document_id);
                      setTimeout(() => {
                        setShowMapOptions(false);
                      }, 100);
                    }}
                    className="w-full rounded-none h-auto p-2 justify-start"
                  >
                    <Flex direction="column" gap="0" className="text-left py-2" align="start">
                      <Text>{map.map_metadata?.name ?? map.name}</Text>
                      <Text>{map.map_module}</Text>
                      {map.updated_at && (
                        <Text size="1">
                          Updated: {new Date(map.updated_at).toLocaleDateString()}
                        </Text>
                      )}
                    </Flex>
                  </Button>
                ))}
              </ScrollArea>
            </Box>
          )}
        </Box>
        <Button
          disabled={!showMapSelector}
          onClick={e => {
            e.preventDefault();
            mutate(mapId);
          }}
        >
          Add map
        </Button>
      </Flex>
      {notification && (
        <Blockquote color={notification.type === 'error' ? 'red' : 'green'}>
          {notification.message}
        </Blockquote>
      )}
      {notification?.type === 'error' && (
        <a href={`/map/edit/${mapId}`} target="_blank">
          View map
        </a>
      )}
      {notification?.type === 'success' && (
        <img src={`${TILESET_URL}/thumbnails/${selectedMap?.tiles_s3_path}`} alt="Map thumbnail" />
      )}
    </Flex>
  );
};

export const MapSelector: React.FC<MapSelectorProps> = ({allowListModules}) => {
  return (
    <QueryClientProvider client={queryClient}>
      <MapSelectorInner allowListModules={allowListModules} />
    </QueryClientProvider>
  );
};
