import React from 'react';
import {CheckboxCards, Flex, Text} from '@radix-ui/themes';
import {styled} from '@stitches/react';

export const ResponsiveCheckboxCards = styled(CheckboxCards.Root, {
  display: 'grid',
  gap: 'var(--space-1)',
  gridTemplateColumns: 'repeat(1, 1fr)',
  '@container (min-width: 240px)': {
    gridTemplateColumns: 'repeat(2, 1fr)',
  },
  '@container (min-width: 360px)': {
    gridTemplateColumns: 'repeat(3, 1fr)',
  },
  '@container (min-width: 600px)': {
    display: 'flex',
    flexWrap: 'wrap',
  },
});

type CardCheckboxProps = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export const CardCheckbox: React.FC<CardCheckboxProps> = ({value, label, disabled}) => {
  return (
    <CheckboxCards.Item value={value} disabled={disabled}>
      <Flex direction="column" width="100%">
        <Text>{label}</Text>
      </Flex>
    </CheckboxCards.Item>
  );
};
