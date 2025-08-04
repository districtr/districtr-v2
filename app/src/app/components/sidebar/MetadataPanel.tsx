import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useMapStore} from '@/app/store/mapStore';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {DEFAULT_MAP_METADATA} from '@/app/utils/language';
import {Blockquote, Box, Button, Flex, Select, Text, TextArea} from '@radix-ui/themes';
import {Input} from 'postcss';
import {useEffect, useState} from 'react';

export const MetadataPanel = () => {
  const isEditing = useMapStore(state => state.isEditing);
  const mapMetadata = useMapMetadata();
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const [innerFormState, setInnerFormState] = useState<DocumentMetadata>(
    mapMetadata ?? DEFAULT_MAP_METADATA
  );
  const [loadingMessage, setLoadingMessage] = useState('');

  useEffect(() => {
    setInnerFormState(mapMetadata ?? DEFAULT_MAP_METADATA);
  }, [mapMetadata]);

  const handleMetadataChange = async (updates: Partial<DocumentMetadata>) => {
    setLoadingMessage('Saving...');
    const r = await saveMap({
      ...(mapMetadata || DEFAULT_MAP_METADATA),
      ...updates,
    });
    if (r) {
      setLoadingMessage('Saved!');
    } else {
      setLoadingMessage('Failed to save');
    }
    setTimeout(() => {
      setLoadingMessage('');
    }, 2000);
  };

  return (
    <Flex
      direction="column"
      gap="2"
      className={`relative ${loadingMessage?.length ? 'pointer-events-none' : ''}`}
    >
      {!!loadingMessage?.length && (
        <Box className="absolute top-0 left-0 w-full h-full bg-white/90 flex items-center justify-center">
          <Text>{loadingMessage}</Text>
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
            <DistrictCommentRow
              key={i}
              index={i}
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
    </Flex>
  );
};

const DistrictCommentRow: React.FC<{
  index: number;
  innerFormState: DocumentMetadata;
  setInnerFormState: (state: DocumentMetadata) => void;
  numDistricts: number;
}> = ({index, innerFormState, setInnerFormState, numDistricts}) => {
  const handleChange = ({
    zone,
    comment
  }: {
    zone?: number;
    comment?: string;
  }) => {
    let comments = [
      ...(innerFormState.district_comments || []),
    ];
    comments[index] = {
      ...comments[index],
      ...(zone && {zone}),
      ...(comment && {comment}),
    }
    setInnerFormState({
      ...innerFormState,
      district_comments: comments,
    });
  }

  const handleRemoveDistrict = () => {
    setInnerFormState({
      ...innerFormState,
      district_comments: (innerFormState.district_comments || []).filter((c, i) => i !== index),
    });
  };

  return (
    <Flex direction="row" gap="2" align="center">
      <Select.Root
        value={innerFormState.district_comments?.[index]?.zone?.toString() || ''}
        onValueChange={value =>
          value === 'remove' ? handleRemoveDistrict() : handleChange({
            zone: value === 'remove' ? undefined : Number(value),
          })
        }
      >
        <Select.Trigger>
          <Text>{innerFormState.district_comments?.[index]?.zone?.toString() || ''}</Text>
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
        value={innerFormState.district_comments?.[index]?.comment || ''}
        className="flex-grow"
        onChange={e => handleChange({
          comment: e.target.value,
        })}
      />
    </Flex>
  );
};
