'use client';
import {useFormState} from '@/app/store/formState';
import {Cross1Icon} from '@radix-ui/react-icons';
import {
  Badge,
  Box,
  Button,
  Flex,
  Text,
  TextField,
} from '@radix-ui/themes';
import {useEffect, useState} from 'react';


export const TagSelector: React.FC<{
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