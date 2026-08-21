'use client';
import {useEffect, useRef, useState} from 'react';
import {useFormState} from '@/app/store/formState';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {thumbnailUrl} from '@/app/utils/api/thumbnailUrl';
import {queryClient} from '@/app/utils/api/queryClient';
import {Blockquote, Flex, Select, Spinner, Switch, Text, TextField} from '@radix-ui/themes';
import {QueryClientProvider, useMutation} from '@tanstack/react-query';
import {useUserMaps} from '@/app/hooks/useUserMaps';
import {routeManager} from '@/app/utils/map/mapUrlRoute';
import {viewPath, parseDocumentIdFromMapUrl} from '@/app/utils/map/editUrl';
import {DRAFT_STATUSES} from '@constants/document/draftStatus';

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
  const [dataResponse, setDataResponse] = useState<ValidationResponse | null>(null);

  const showMapSelector = useFormState(state => state.showMapSelector);
  const comment = useFormState(state => state.comment);
  const mapId = comment?.document_id ?? '';
  const [savedMapId, setSavedMapId] = useState<string | null>(null);

  const setShowMapSelector = useFormState(state => state.setShowMapSelector);
  const setFormState = useFormState(state => state.setFormState);
  // TODO Support community maps
  const {districtMaps: allDistrictMaps} = useUserMaps();
  // only offer maps that would pass module validation
  const districtMaps = allDistrictMaps.filter(map =>
    allowListModules.includes(map.districtr_map_slug ?? '')
  );
  // which of the user's maps the current link points to, if any
  const parsedMapId = parseDocumentIdFromMapUrl(mapId);
  const selectedMapId =
    districtMaps.find(
      map => map.document_id === parsedMapId || String(map.public_id) === parsedMapId
    )?.document_id ?? '';

  const [notification, setNotification] = useState<null | {
    type: 'error' | 'success' | 'warning';
    message: string;
  }>(null);

  useEffect(() => {
    if (!showMapSelector) {
      setSavedMapId(mapId);
      setFormState('comment', 'document_id', '');
    } else if (showMapSelector && savedMapId && !mapId) {
      setFormState('comment', 'document_id', savedMapId);
    }
    setDataResponse(null);
    setNotification(null);
  }, [showMapSelector]);

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
      response.isForeignLink = _mapUrlIsValid.hostname !== window.location.hostname;
    } catch {
      throw new Error('Not a valid url');
    }

    // take the slash and then the last characters after the slash
    const urlStrippedId = parseDocumentIdFromMapUrl(mapId) ?? undefined;
    const userMap = districtMaps?.find(
      map => map.document_id === urlStrippedId || String(map.public_id) === urlStrippedId
    );
    const document = await getDocument(urlStrippedId);
    if (document.ok) {
      response.mapInfo = document.response;
    } else {
      throw new Error('Map not found');
    }
    response.isPublicId = !isNaN(Number(urlStrippedId));
    response.mayNotBeUserMap = response.isPublicId && !userMap;
    if (response.isForeignLink) {
      throw new Error('Please use a link to a Districtr map.');
    } else if (
      response.mapInfo &&
      response.mapInfo.map_metadata?.draft_status !== DRAFT_STATUSES.READY_TO_SHARE
    ) {
      throw new Error(
        'Please make sure your map is marked as "ready to share" in the map editor. You can update this in the "Save and share" menu or using the button next to the map title on the top of the map editor.'
      );
    } else if (
      response.mapInfo &&
      !allowListModules.includes(response.mapInfo?.districtr_map_slug ?? '')
    ) {
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

  const selectMap = (documentId: string) => {
    const publicId = districtMaps.find(map => map.document_id === documentId)?.public_id ?? null;
    // eval requires a public id; maps without one (pre-#636) can't be linked this way
    if (publicId == null) return;
    const mapUrl = new URL(
      viewPath(routeManager.mapUrlRoute, publicId),
      window.location.href
    ).toString();
    setFormState('comment', 'document_id', mapUrl);
    mutate(mapUrl);
  };

  return (
    <Flex direction="column" gap="2" width="100%">
      <Flex direction="row" gap="2" align="center">
        <Switch
          id="map-selector-toggle"
          checked={showMapSelector}
          onCheckedChange={setShowMapSelector}
        />
        <Text as="label" size="2" weight="medium" htmlFor="map-selector-toggle">
          Include a link to your map?
        </Text>
      </Flex>
      {showMapSelector && (
        <>
          {districtMaps.length > 0 && (
            <Select.Root value={selectedMapId} onValueChange={selectMap}>
              <Select.Trigger placeholder="Choose one of your recent maps" />
              <Select.Content position="popper">
                {districtMaps.map(map => (
                  <Select.Item key={map.document_id} value={map.document_id}>
                    {[
                      map.map_metadata?.name,
                      map.map_module,
                      map.updated_at && `updated ${new Date(map.updated_at).toLocaleDateString()}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          )}
          <TextField.Root
            ref={inputRef}
            type="url"
            required={showMapSelector}
            value={mapId}
            color={dataResponse?.mapInfo?.document_id === mapId ? 'green' : 'gray'}
            onChange={e => setFormState('comment', 'document_id', e.target.value)}
            onBlur={() => mapId && mutate(mapId)}
            aria-invalid={showMapSelector && dataResponse?.type === 'error'}
            placeholder={
              districtMaps.length ? 'or paste a link to your map' : 'Paste a link to your map'
            }
          >
            {isPending && (
              <TextField.Slot side="right">
                <Spinner size="1" />
              </TextField.Slot>
            )}
          </TextField.Root>
        </>
      )}
      {showMapSelector && notification && (
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
      {showMapSelector && notification?.type === 'success' && dataResponse?.mapInfo?.public_id && (
        <object
          data={thumbnailUrl(dataResponse.mapInfo.public_id)}
          type="image/png"
          className="size-32"
          aria-label="Map thumbnail"
        >
          <img src="/home-megaphone-square.png" alt="Map thumbnail" className="size-32" />
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
