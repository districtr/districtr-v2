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
  const missingDistrictComments = Array.from({length: numDistricts || 0}, (_, i) => i + 1).filter(
    i => !innerFormState.district_comments?.[i]
  );

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
        {Object.keys(innerFormState.district_comments || {}).map(district =>
          isEditing ? (
            <DistrictCommentRow
              key={district}
              district={Number(district)}
              innerFormState={innerFormState}
              setInnerFormState={setInnerFormState}
              numDistricts={numDistricts || 0}
            />
          ) : (
            <Blockquote>
              <b>{district}:</b> {innerFormState.district_comments?.[Number(district)] || ''}
            </Blockquote>
          )
        )}
        {missingDistrictComments.length > 0 && isEditing && (
          <Button
            onClick={() =>
              setInnerFormState({
                ...innerFormState,
                district_comments: {
                  ...innerFormState.district_comments,
                  [missingDistrictComments[0]]: `District ${missingDistrictComments[0]} comments`,
                },
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
  district: number;
  innerFormState: DocumentMetadata;
  setInnerFormState: (state: DocumentMetadata) => void;
  numDistricts: number;
}> = ({district, innerFormState, setInnerFormState, numDistricts}) => {
  const handleChangeDistrictNumber = (value: string) => {
    const content = innerFormState.district_comments?.[Number(district)];
    const previousContent = {...innerFormState.district_comments};
    delete previousContent[district];
    setInnerFormState({
      ...innerFormState,
      district_comments: {...previousContent, [Number(value)]: content || ''},
    });
  };

  const handleChangeText = (value: string) => {
    setInnerFormState({
      ...innerFormState,
      district_comments: {...innerFormState.district_comments, [Number(district)]: value},
    });
  };
  const handleRemoveDistrict = () => {
    const previousContent = {...innerFormState.district_comments};
    delete previousContent[district];
    setInnerFormState({...innerFormState, district_comments: previousContent});
  };

  return (
    <Flex direction="row" gap="2" align="center">
      <Select.Root
        value={district.toString()}
        onValueChange={value =>
          value === 'remove' ? handleRemoveDistrict() : handleChangeDistrictNumber(value)
        }
      >
        <Select.Trigger>
          <Text>{district}</Text>
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
        value={innerFormState.district_comments?.[Number(district)] || ''}
        className="flex-grow"
        onChange={e => handleChangeText(e.target.value)}
      />
    </Flex>
  );
};
