'use client';
import {useFormState} from '@/app/store/formState';
import {useEffect, useState} from 'react';
import {TagSelector} from './TagSelector';

export const CommentFormTagSelector: React.FC<{
  mandatoryTags?: string[];
}> = ({mandatoryTags}) => {
  const tags = useFormState(state => state.tags);
  const setTags = useFormState(state => state.setTags);
  const [tagInput, setTagInput] = useState('');
  useEffect(() => {
    const tagsIsArray = Array.isArray(tags);
    mandatoryTags?.forEach(tag => {
      if (!tagsIsArray || (tagsIsArray && !tags?.includes(tag))) {
        setTags(tag, 'add');
      }
    });
  }, [mandatoryTags?.length, tags, setTags]);

  const handleTag = (tag: string, action: 'add' | 'remove') => {
    const trimmedTag = tag.trim();
    if (trimmedTag === '') {
      return;
    }
    setTags(trimmedTag, action);
    setTagInput('');
  };

  const handleKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTag(tagInput, 'add');
    }
  };

  return (
    <TagSelector
      tagInput={tagInput}
      setTagInput={setTagInput}
      fixedTags={mandatoryTags?.length ? mandatoryTags : undefined}
      tags={Array.from(tags)}
      handleChange={handleTag}
      handleKeyInput={handleKeyInput}
    />
  );
};
