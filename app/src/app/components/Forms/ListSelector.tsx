'use client';
import {CheckCircledIcon} from '@radix-ui/react-icons';
import {Box, Flex, Select, Text} from '@radix-ui/themes';

export type ListSelectorProps<T> = {
  title?: string;
  handleChange: (item: string, action: 'add' | 'remove') => void;
  value: string[];
  entries: T[];
  keyProperty: keyof T;
  SelectComponent: React.FC<T>;
};

export function ListSelector<T extends object>({
  title,
  value,
  handleChange,
  entries,
  keyProperty,
  SelectComponent,
}: ListSelectorProps<T>) {
  return (
    <Box width="100%">
      {title && (
        <Text as="label" size="2" weight="medium" id="tags">
          {title}
        </Text>
      )}
      <Flex direction="row" gap="2">
        <Select.Root
          value={undefined}
          onValueChange={newValue => {
            const isIncluded = value.includes(newValue);
            handleChange(newValue, isIncluded ? 'remove' : 'add');
          }}
        >
          <Select.Trigger>
            <Text>{value.length} items selected</Text>
          </Select.Trigger>
          <Select.Content>
            {entries.map((entry, i) => {
              const isSelected = value.includes(entry[keyProperty] as string);
              return (
                <Select.Item key={i} value={entry[keyProperty] as string} className="h-min py-1">
                  <Flex direction="row" gap="2" align="center" justify="between">
                    <Box className="size-4 flex-none">
                      {isSelected ? <CheckCircledIcon color="green" /> : null}
                    </Box>
                    <SelectComponent {...entry} />
                  </Flex>
                </Select.Item>
              );
            })}
          </Select.Content>
        </Select.Root>
      </Flex>
    </Box>
  );
}
