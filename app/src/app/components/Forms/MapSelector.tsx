'use client';
import {useEffect, useRef, useState} from 'react';
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

interface MapSelectorProps {
  allowListModules: string[];
}
interface ValidationResponse {
  input: string;
  isUrl: boolean;
  isForeignLink: boolean;
  isPublicId: boolean;
  mayNotBeUserMap: boolean;
  mapInfo: DocumentObject | null;
  message: string | null;
  type: 'error' | 'success' | 'warning' | null;
}

const MapSelectorInner: React.FC<MapSelectorProps> = ({allowListModules}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [dataResponse, setDataResponse] = useState<ValidationResponse | null>(null);

  const showMapSelector = useFormState(state => state.showMapSelector);
  const comment = useFormState(state => state.comment);
  const mapId = comment?.document_id ?? '';

  const setShowMapSelector = useFormState(state => state.setShowMapSelector);
  const setFormState = useFormState(state => state.setFormState);

  useEffect(() => {
    setDataResponse(null);
  }, [showMapSelector]);

  const [notification, setNotification] = useState<null | {
    type: 'error' | 'success' | 'warning';
    message: string;
  }>(null);

  const userMaps = useMapStore(state =>
    state.userMaps.filter(
      map => !allowListModules?.length || allowListModules.includes(map.map_module ?? '')
    )
  );

  const validateMap = async (mapId: string) => {
    let response: ValidationResponse = {
      input: mapId,
      isUrl: false,
      isForeignLink: false,
      isPublicId: false,
      mayNotBeUserMap: false,
      mapInfo: null,
      message: null,
      type: null,
    };

    try {
      const _mapUrlIsValid = new URL(mapId);
      response.isUrl = true;
    } catch {
      throw new Error('Not a valid url');
    }

    // take the slash and then the last characters after the slash
    const urlStrippedId = mapId.split('/').pop()?.replace('?pw=true', '');
    const userMap = userMaps?.find(map => map.document_id === urlStrippedId);
    try {
      response.mapInfo = await getDocument(urlStrippedId);
    } catch {
      throw new Error('Map not found');
      // could not get document
    }
    response.isPublicId = !isNaN(Number(urlStrippedId));
    response.mayNotBeUserMap = response.isPublicId && !userMap;
    if (response.mapInfo && response.mapInfo.map_metadata?.draft_status !== 'ready_to_share') {
      throw new Error(
        'Please make sure your map is marked as "ready to share" in the map editor. You can update this in the "Save and share" menu or using the button next to the map title on the top of the map editor.'
      );
    } else if (response.mapInfo && !allowListModules.includes(response.mapInfo?.districtr_map_slug ?? '')) {
      throw new Error(
        `Please make sure your map is in the list of allowed modules: ${allowListModules.join(', ')}`
      );
    } else if (response.mayNotBeUserMap) {
      response.message =
        'Warning: This link is a public map link and may not be your map. Other users can change their maps, which could change the meaning of your comment. Consider making a copy of the map by going to the map and clicking "Save and share" and then create a copy.';
      response.type = 'warning';
    } else {
      response.message = 'Map validated successfully';
      response.type = 'success';
    }
    return response;
  };

  const {isPending, mutate} = useMutation({
    mutationFn: validateMap,
    onSuccess: data => {
      setDataResponse(data ?? null);
      if (!data?.type) {
        inputRef?.current?.setCustomValidity(data?.message ?? 'Map validation failed');
        setNotification({
          type: 'error',
          message: 'Map validation failed',
        });
        return;
      } else if (data?.type === 'success') {
        inputRef?.current?.setCustomValidity('');
        setNotification({
          type: 'success',
          message: 'Map validated successfully',
        });
      } else {
        setNotification({
          type: data?.type ?? 'error',
          message: data?.message ?? 'Map validation failed',
        });
      }
    },
    onError: error => {
      inputRef?.current?.setCustomValidity(error.message ?? 'Map validation failed');
      setNotification({
        type: 'error',
        message: error.message,
      });
    },
  });

  useEffect(() => {
    // revalidate on load
    if (!isPending && mapId && showMapSelector) {
      mutate(mapId);
    }
  }, [mapId]);

  return (
    <Flex direction="column" gap="2" position="relative" width="100%">
      <Flex direction="row" gap="2" align="center">
        <Switch checked={showMapSelector} onCheckedChange={setShowMapSelector} />
        <Text as="label" size="2" weight="medium" id="map-selector">
          Include a link to your map?
        </Text>
      </Flex>
      <Flex direction="row" gap="2" align="center" onClick={() => setShowMapSelector(true)}>
        <Box position="relative" flexGrow="1">
          <TextField.Root
            ref={inputRef}
            type="url"
            disabled={!showMapSelector}
            required={showMapSelector}
            value={mapId}
            color={dataResponse?.mapInfo?.document_id === mapId ? 'green' : 'gray'}
            onChange={e => setFormState('comment', 'document_id', e.target.value)}
            onFocus={() => setShowMapOptions(true)}
            onClick={() => setShowMapOptions(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowMapOptions(false);
              }, 100);
              mutate(mapId);
            }}
            aria-invalid={showMapSelector && dataResponse?.type === 'error'}
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
                    onMouseDown={e => {
                      e.preventDefault();
                      const mapUrl = new URL(`/map/edit/${map.document_id}`, window.location.href);
                      setFormState('comment', 'document_id', mapUrl.toString());
                      setShowMapOptions(false);
                      mutate(mapUrl.toString());
                    }}
                    onClick={e => {
                      e.preventDefault();
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
      </Flex>
      {notification && (
        <Blockquote
          color={
            notification.type === 'error'
              ? 'red'
              : notification.type === 'warning'
                ? 'yellow'
                : 'green'
          }
        >
          {notification.message}
        </Blockquote>
      )}
      {notification?.type === 'success' && (
        <object data="/home-megaphone-square.png" type="image/png" className="size-32">
          <img
            src={`${TILESET_URL}/thumbnails/${dataResponse?.mapInfo?.public_id}.png`}
            alt="Map thumbnail"
            className="size-32"
          />
        </object>
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
