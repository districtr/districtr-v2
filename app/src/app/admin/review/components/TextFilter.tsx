import {Box, Flex, Text, TextField, Button} from '@radix-ui/themes';
import {useState, useEffect} from 'react';

export const TextFilter: React.FC<{
  title: string;
  initialText: string | undefined;
  onEnter: (text: string) => void;
}> = ({title, initialText, onEnter}) => {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  return (
    <Box width="100%">
      <Text as="label" size="2" weight="medium" id={title}>
        {title}
      </Text>
      <Flex direction="row" gap="2">
        <TextField.Root
          value={text}
          onChange={e => setText(e.target.value)}
          className="flex-1 w-full"
          onKeyDown={e => {
            if (e.key === 'Enter' && text) {
              e.preventDefault();
              onEnter(text);
            }
          }}
        />
        {text !== initialText && text && <Button onClick={() => onEnter(text)}>OK</Button>}
      </Flex>
    </Box>
  );
};
