'use client';

import {ContentHeader} from '@/app/components/Static/ContentHeader';
import {FormState, useFormState} from '@/app/store/formState';
import {useMapStore} from '@/app/store/mapStore';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';
import {queryClient} from '@/app/utils/api/queryClient';
import {Cross1Icon} from '@radix-ui/react-icons';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  ScrollArea,
  Spinner,
  Switch,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import {QueryClientProvider, useMutation} from '@tanstack/react-query';
import {useEffect, useState} from 'react';

export default function DevPage() {
  const submitForm = useFormState(state => state.submitForm);
  return (
    <Box p="4">
      <form
        onSubmit={e => {
          e.preventDefault();
          submitForm();
        }}
      >
        <Flex direction="column" gap="4">
          <ContentHeader title="Submission Title" />
          <FormField formPart="comment" formProperty="title" label="Submission Title" type="text" />
          <FormField
            formPart="comment"
            formProperty="comment"
            label="Testimony"
            type="text"
            component={TextArea}
          />
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            gap="4"
          >
            <TagSelector mandatoryTags={['ca-redistricting-2025']} />
            <MapSelector allowListModules={['ca Congressional Districts (52)']} />
          </Flex>
          <ContentHeader title="Tell us about yourself" />
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            gap="4"
            width="100%"
          >
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                formPart="commenter"
                formProperty="salutation"
                label="Salutation"
                type="text"
                autoComplete="honorific-prefix"
              />
            </Box>
            <Box flexGrow="1" flexBasis="40%">
              <FormField
                formPart="commenter"
                formProperty="first_name"
                label="First Name"
                type="text"
                autoComplete="given-name"
              />
            </Box>
            <Box flexGrow="1" flexBasis="40%">
              <FormField
                formPart="commenter"
                formProperty="last_name"
                label="Last Name"
                type="text"
                autoComplete="family-name"
              />
            </Box>
          </Flex>
          <FormField
            formPart="commenter"
            formProperty="email"
            label="Email"
            type="email"
            autoComplete="email"
          />
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            gap="4"
            width="100%"
          >
            <Box flexGrow="1" flexBasis="60%">
              <FormField
                formPart="commenter"
                formProperty="place"
                label="City/County (optional but encouraged)"
                type="text"
                autoComplete="address-level2"
              />
            </Box>
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                formPart="commenter"
                formProperty="state"
                label="State"
                type="text"
                autoComplete="address-level1"
              />
            </Box>
            <Box flexGrow="1" flexBasis="20%">
              <FormField
                formPart="commenter"
                formProperty="zip_code"
                label="Zip Code"
                type="text"
                autoComplete="postal-code"
              />
            </Box>
          </Flex>
          <Flex direction="column" gap="4">
            <Box flexGrow="1" flexBasis="60%">
              <Acknowledgement
                id="comment-is-public"
                label="I understand that my public comment submission will be made available to the Commission and other members of the public."
              />
            </Box>
            <Box flexGrow="1" flexBasis="60%">
              <Acknowledgement
                id="email-is-confidential"
                label="I understand that while this public comment submission is a public document, my email address will be kept confidential to the extent authorized by law."
              />
            </Box>
          </Flex>
          <Button>Submit</Button>
        </Flex>
      </form>
    </Box>
  );
}

type FormPart = 'comment' | 'commenter';

type FormFieldProps<T extends FormPart> = {
  formPart: T;
  formProperty: keyof FormState[T];
  label: string;
  placeholder?: string;
  type: TextField.RootProps['type'];
  autoComplete?: TextField.RootProps['autoComplete'];
  component?: typeof TextField.Root | typeof TextArea;
};

function FormField<T extends FormPart>({
  formPart,
  formProperty,
  label,
  type,
  placeholder,
  component,
}: FormFieldProps<T>) {
  const value = useFormState(state => state[formPart][formProperty] as string);
  const setFormState = useFormState(state => state.setFormState);
  const Component = component ?? TextField.Root;
  return (
    <Box>
      <Text as="label" size="2" weight="medium" id={`${formPart}-${formProperty as string}`}>
        {label}
      </Text>
      <Component
        placeholder={placeholder ?? label}
        type={type}
        name={`${formPart}-${formProperty as string}`}
        aria-labelledby={`${formPart}-${formProperty as string}`}
        value={value}
        autoComplete="off"
        onChange={e => setFormState(formPart, formProperty as keyof FormState[T], e.target.value)}
      />
    </Box>
  );
}

const Acknowledgement = ({id, label}: {id: string; label: string}) => {
  const acknowledgement = useFormState(state => state.acknowledgement);
  const setAcknowledgement = useFormState(state => state.setAcknowledgement);

  useEffect(() => {
    setAcknowledgement(id, false);
  }, [id]);

  return (
    <Flex direction="row" gap="2" align="center">
      <Checkbox
        checked={acknowledgement[id]}
        onCheckedChange={() => setAcknowledgement(id, !acknowledgement[id])}
      />
      <Text as="label" size="2" weight="medium" id={`${id}`}>
        {label}
      </Text>
    </Flex>
  );
};

const TagSelector: React.FC<{
  mandatoryTags: string[];
}> = ({mandatoryTags}) => {
  const tags = useFormState(state => state.tags);
  const setTags = useFormState(state => state.setTags);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    mandatoryTags.forEach(tag => {
      if (!tags.has(tag)) {
        setTags(tag, 'add');
      }
    });
  }, [mandatoryTags, tags, setTags]);

  const handleTag = (tag: string) => {
    setTags(tag, 'add');
    setTagInput('');
  };

  const handleKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTag(tagInput);
    }
  };

  return (
    <Box width="100%">
      <Text as="label" size="2" weight="medium" id="tags">
        Tags
      </Text>
      <Flex direction="row" gap="2">
        <TextField.Root
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleKeyInput}
        >
          <TextField.Slot>
            <Text>#</Text>
          </TextField.Slot>
        </TextField.Root>
        <Button
          onClick={e => {
            e.preventDefault();
            handleTag(tagInput);
          }}
        >
          Add
        </Button>
      </Flex>
      <Flex direction="row" gap="2" wrap="wrap" className="py-2">
        {Array.from(tags).map(tag => (
          <Badge
            key={tag}
            variant="surface"
            size="3"
            color={mandatoryTags.includes(tag) ? 'gray' : 'blue'}
            className={`${mandatoryTags.includes(tag) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={mandatoryTags.includes(tag) ? undefined : () => setTags(tag, 'remove')}
          >
            {tag} {!mandatoryTags.includes(tag) && <Cross1Icon />}
          </Badge>
        ))}
      </Flex>
    </Box>
  );
};

interface MapSelectorProps {
  allowListModules: string[];
}
const MapSelector: React.FC<MapSelectorProps> = ({allowListModules}) => {
  return (
    <QueryClientProvider client={queryClient}>
      <MapSelectorInner allowListModules={allowListModules} />
    </QueryClientProvider>
  );
};

const MapSelectorInner: React.FC<MapSelectorProps> = ({allowListModules}) => {
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [mapId, setMapId] = useState('');
  const userMaps = useMapStore(state =>
    state.userMaps.filter(
      map => !allowListModules?.length || allowListModules.includes(map.map_module ?? '')
    )
  );

  const validateMap = async (mapId: string) => {
    const document = await getDocument(mapId);
    console.log(document);
  };

  const {data, isPending, isError, isSuccess, error, mutate, mutateAsync, reset, status} =
    useMutation({
      mutationFn: validateMap,
      onSuccess: data => {
        console.log(data);
      },
    });

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
          Include a map?
        </Text>
      </Flex>
      <Flex direction="row" gap="2" align="center" onClick={() => setShowMapSelector(true)}>
        <Box position="relative" flexGrow="1">
          <TextField.Root
            type="text"
            disabled={!showMapSelector}
            value={mapId}
            onChange={e => setMapId(e.target.value)}
            onFocus={() => setShowMapOptions(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowMapOptions(false);
              }, 100);
            }}
            placeholder="Include a link to your map or map ID"
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
                    onClick={() => {
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
                      {map.updated_at && <Text size="1">Updated: {new Date(map.updated_at).toLocaleDateString()}</Text>}
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
    </Flex>
  );
};
