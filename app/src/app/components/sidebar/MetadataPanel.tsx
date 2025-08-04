import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useMapStore} from '@/app/store/mapStore';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {DEFAULT_MAP_METADATA} from '@/app/utils/language';
import {SewingPinFilledIcon, TrashIcon} from '@radix-ui/react-icons';
import {Blockquote, Box, Button, Flex, IconButton, Select, Text, TextArea} from '@radix-ui/themes';
import {useEffect, useState} from 'react';
import { Pin } from '../Topbar/Icons';

export const MetadataPanel = () => {
  const isEditing = useMapStore(state => state.isEditing);
  const mapMetadata = useMapMetadata();
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const getMapRef = useMapStore(state => state.getMapRef);
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const [innerFormState, setInnerFormState] = useState<DocumentMetadata>(
    mapMetadata ?? DEFAULT_MAP_METADATA
  );
  const [infoMessage, setInfoMessage] = useState('');
  const handleMapPin = () => {
    const map = getMapRef();
    if (map) {
      const prevTool = activeTool;
      setActiveTool('pin');
      setInfoMessage('Click on the map to add a pin');
      // on one click get lat lon from map
      map.once('click', e => {
        const {lat, lng} = e.lngLat;
        setInnerFormState({
          ...innerFormState,
          location_comments: [...(innerFormState.location_comments || []), {lat, lng, comment: ''}],
        });
        setActiveTool(prevTool);
        setInfoMessage('');
      });
    }
  };

  useEffect(() => {
    if (innerFormState.location_comments?.length && innerFormState.location_comments.length > (mapMetadata?.location_comments?.length || 0)) {
      handleMetadataChange({
        location_comments: innerFormState.location_comments,
      })
    }
  }, [innerFormState.location_comments?.length])

  useEffect(() => {
    setInnerFormState(mapMetadata ?? DEFAULT_MAP_METADATA);
  }, [mapMetadata]);

  const handleMetadataChange = async (updates: Partial<DocumentMetadata>) => {
    setInfoMessage('Saving...');
    const r = await saveMap({
      ...(mapMetadata || DEFAULT_MAP_METADATA),
      ...updates,
    });
    if (r) {
      setInfoMessage('Saved!');
    } else {
      setInfoMessage('Failed to save');
    }
    setTimeout(() => {
      setInfoMessage('');
    }, 2000);
  };

  return (
    <Flex
      direction="column"
      gap="2"
      className={`relative ${infoMessage?.length ? 'pointer-events-none' : ''}`}
    >
      {!!infoMessage?.length && (
        <Box className="absolute top-0 left-0 w-full h-full bg-white/90 flex items-center justify-center">
          <Text>{infoMessage}</Text>
        </Box>
      )}
      <Flex direction="column" gap="2">
        <Text>Plan Comments</Text>
        {isEditing ? (
          <TextArea
            value={innerFormState?.description || ''}
            onChange={e => setInnerFormState({...innerFormState, description: e.target.value})}
          />
        ) : (
          <Blockquote>{innerFormState?.description || ''}</Blockquote>
        )}
      </Flex>
      {isEditing && (
        <Flex direction="row" gap="2">
          <Button
            onClick={() =>
              handleMetadataChange({
                description: innerFormState.description,
                district_comments: innerFormState.district_comments,
                location_comments: innerFormState.location_comments,
              })
            }
            color="green"
          >
            Save
          </Button>
          <Button
            onClick={() => setInnerFormState(mapMetadata ?? DEFAULT_MAP_METADATA)}
            color="red"
          >
            Reset
          </Button>
        </Flex>
      )}
      <Flex direction="column" gap="2">
        <Text>District Comments</Text>
        {(innerFormState.district_comments || []).map((entry, i) =>
          isEditing ? (
            <CommentRow
              key={i}
              index={i}
              commentProperty="district_comments"
              innerFormState={innerFormState}
              setInnerFormState={setInnerFormState}
              numDistricts={numDistricts || 0}
            />
          ) : (
            <Blockquote>
              <b>{entry.zone}:</b> {entry.comment}
            </Blockquote>
          )
        )}
        {isEditing && (
          <Button
            onClick={() =>
              setInnerFormState({
                ...innerFormState,
                district_comments: [
                  ...(innerFormState.district_comments || []),
                  {zone: 1, comment: `District comments`},
                ],
              })
            }
          >
            Add District Comments
          </Button>
        )}
      </Flex>

      <Flex direction="column" gap="2">
        <Text>Pin Comments</Text>
        {innerFormState.location_comments?.map((entry, i) => (
          <CommentRow
            key={i}
            index={i}
            innerFormState={innerFormState}
            setInnerFormState={setInnerFormState}
            commentProperty="location_comments"
            numDistricts={0}
          />
        ))}
        <Button onClick={handleMapPin}>Add Map Pin</Button>
      </Flex>
    </Flex>
  );
};

const CommentRow: React.FC<{
  index: number;
  innerFormState: DocumentMetadata;
  setInnerFormState: (state: DocumentMetadata) => void;
  commentProperty: 'district_comments' | 'location_comments';
  numDistricts: number;
}> = ({index, innerFormState, setInnerFormState, numDistricts, commentProperty}) => {
  const handleChange = ({zone, comment}: {zone?: number; comment?: string}) => {
    let comments = [...(innerFormState[commentProperty] || [])];
    comments[index] = {
      ...comments[index],
      ...(zone && {zone}),
      ...(comment && {comment}),
    };
    setInnerFormState({
      ...innerFormState,
      [commentProperty]: comments,
    });
  };

  const handleRemove = () => {
    setInnerFormState({
      ...innerFormState,
      [commentProperty]: (innerFormState[commentProperty] || []).filter((c, i) => i !== index),
    });
  };

  const getMapRef = useMapStore(state => state.getMapRef);
  const zoomToPin = (lat: number | undefined, lng: number | undefined) => {
    if (!lat || !lng) return;
    const map = getMapRef();
    if (map) {
      map.flyTo({center: [lng, lat], zoom: 12});
    }
  };

  if (commentProperty === 'district_comments') {
    return (
      <Flex direction="row" gap="2" align="center">
        <Select.Root
          value={innerFormState[commentProperty]?.[index]?.zone?.toString() || ''}
          onValueChange={value =>
            value === 'remove'
              ? handleRemove()
              : handleChange({
                  zone: value === 'remove' ? undefined : Number(value),
                })
          }
        >
          <Select.Trigger>
            <Text>{innerFormState[commentProperty]?.[index]?.zone?.toString() || ''}</Text>
          </Select.Trigger>
          <Select.Content>
            <Select.Item key="remove" value="remove">
              Remove
            </Select.Item>
            {Array.from({length: numDistricts || 0}, (_, i) => (
              <Select.Item key={i} value={(i + 1).toString()}>
                {i + 1}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <TextArea
          value={innerFormState[commentProperty]?.[index]?.comment || ''}
          className="flex-grow"
          onChange={e =>
            handleChange({
              comment: e.target.value,
            })
          }
        />
      </Flex>
    );
  } else {
    return (
      <Flex direction="row" gap="2" align="center">
        <IconButton
          onClick={() =>
            zoomToPin(
              innerFormState[commentProperty]?.[index]?.lat,
              innerFormState[commentProperty]?.[index]?.lng
            )
          }
          variant="outline"
        >
          <Pin size="size-4" />
        </IconButton>
        <TextArea
          value={innerFormState[commentProperty]?.[index]?.comment || ''}
          className="flex-grow"
          onChange={e =>
            handleChange({
              comment: e.target.value,
            })
          }
        />
        <IconButton onClick={handleRemove} color="red" variant="ghost">
          <TrashIcon />
        </IconButton>
      </Flex>
    );
  }
};
