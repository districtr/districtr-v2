import {useState} from 'react';
import {TagSelector} from '@/app/components/Forms/TagSelector';

export const TagReviewFilter: React.FC<{
  tags: string[];
  setTags: (tags: string[]) => void;
}> = ({tags, setTags}) => {
  const [tagInput, setTagInput] = useState('');
  const handleChange = (tag: string, action: 'add' | 'remove') => {
    setTags(action === 'add' ? [...tags, tag] : tags.filter(t => t !== tag));
  };
  const handleKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleChange(tagInput, 'add');
    }
  };
  return (
    <TagSelector
      tagInput={tagInput}
      setTagInput={setTagInput}
      fixedTags={[]}
      tags={Array.from(tags)}
      handleChange={handleChange}
      handleKeyInput={handleKeyInput}
    />
  );
};
