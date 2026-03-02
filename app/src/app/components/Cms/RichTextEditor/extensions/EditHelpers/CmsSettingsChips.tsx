/**
 * CmsSettingsChips - Reusable chip/tag editor for CMS node settings dialogs.
 *
 * Displays a list of values as removable chips with an input to add new values.
 * Used by PlanGalleryNodeView and CommentGalleryNodeView for managing IDs and tags.
 *
 * @example
 * <CmsSettingsChips
 *   entries={['tag1', 'tag2']}
 *   handleUpdate={(updates) => updateAttributes(updates)}
 *   property="tags"
 * />
 */
import React from 'react';
import {Flex, Box, Button, Text, TextField} from '@radix-ui/themes';

type EntryValue = string | number;

export const CmsSettingsChips: React.FC<{
  /** Current array of values to display as chips */
  entries: EntryValue[];
  /** Callback to update the parent node's attributes */
  handleUpdate: (updates: Record<string, EntryValue[]>) => void;
  /** Property name used as the key in handleUpdate (e.g., 'tags', 'ids') */
  property: string;
  /** Whether to show a title above the chips */
  showTitle?: boolean;
}> = ({entries, handleUpdate, property, showTitle = false}) => {
  const [text, setText] = React.useState('');
  return (
    <Flex direction="column" gap="2" py="4" mb="2" className="border-b border-gray-300">
      {showTitle && <Text>{property.charAt(0).toUpperCase() + property.slice(1)}</Text>}
      <Box>
        {entries?.map((entry, i) => (
          <Button
            className="hover:bg-red-500 hover:text-white w-auto mr-2"
            variant="outline"
            onClick={() => handleUpdate({[property]: entries.filter(t => t !== entry)})}
            key={i}
          >
            {entry} &times;
          </Button>
        ))}
      </Box>
      <Flex direction="row" gap="2">
        <TextField.Root
          placeholder={`Add a ${property}`}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <Button
          onClick={() => {
            handleUpdate({[property]: [...(entries || []), text]});
            setText('');
          }}
        >
          Add
        </Button>
      </Flex>
    </Flex>
  );
};
