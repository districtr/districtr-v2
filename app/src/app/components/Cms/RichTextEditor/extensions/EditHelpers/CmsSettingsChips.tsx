import React from 'react';
import {Flex, Box, Button, Text, TextField} from '@radix-ui/themes';

export const CmsSettingsChips: React.FC<{
  entries: string[] | number[];
  handleUpdate: (updates: {[key: string]: string[] | number[]}) => void;
  property: string;
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
            // @ts-expect-error
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
            // @ts-expect-error
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
