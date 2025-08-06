'use client';
import {useFormState} from '@/app/store/formState';
import {Cross1Icon} from '@radix-ui/react-icons';
import {Badge, Box, Button, Flex, Text, TextField} from '@radix-ui/themes';
import {KeyboardEventHandler, useEffect, useState} from 'react';

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

  const handleTag = (tag: string, action: 'add' | 'remove') => {
    setTags(tag, action);
    setTagInput('');
  };

  const handleKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTag(tagInput, 'add');
    }
  };

  return (
    <TagSelectorInner
      tagInput={tagInput}
      setTagInput={setTagInput}
      fixedTags={mandatoryTags}
      tags={Array.from(tags)}
      handleChange={handleTag}
      handleKeyInput={handleKeyInput}
    />
  );
};

export const TagSelectorInner: React.FC<{
  tagInput: string;
  setTagInput: (tagInput: string) => void;
  fixedTags: string[];
  tags: string[];
  handleChange: (tag: string, action: 'add' | 'remove') => void;
  handleKeyInput: KeyboardEventHandler<HTMLInputElement>;
}> = ({tagInput, setTagInput, fixedTags, tags, handleChange, handleKeyInput}) => {
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
            handleChange(tagInput, 'add');
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
            color={fixedTags.includes(tag) ? 'gray' : 'blue'}
            className={`${fixedTags.includes(tag) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={fixedTags.includes(tag) ? undefined : () => handleChange(tag, 'remove')}
          >
            {tag} {!fixedTags.includes(tag) && <Cross1Icon />}
          </Badge>
        ))}
      </Flex>
    </Box>
  );
};
