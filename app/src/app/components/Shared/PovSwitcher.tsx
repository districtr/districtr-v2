'use client';
import {Flex, RadioGroup, Text} from '@radix-ui/themes';

/** Partisan point of view for election tables/metrics. */
export type Pov = 'dem' | 'rep';

/** The Democratic/Republican point-of-view toggle used by the partisan tables. */
export const PovSwitcher: React.FC<{
  pov: Pov;
  setPov: (pov: Pov) => void;
  labelSize?: '1' | '2';
}> = ({pov, setPov, labelSize = '1'}) => (
  <Flex justify="start" align="center" gap="2">
    <Text size={labelSize} color="gray">
      Point of view
    </Text>
    <RadioGroup.Root size="1" value={pov} onValueChange={v => setPov(v as Pov)}>
      <Flex direction="row" align="center" gapX="3" wrap="wrap">
        <RadioGroup.Item value="dem">Democratic</RadioGroup.Item>
        <RadioGroup.Item value="rep">Republican</RadioGroup.Item>
      </Flex>
    </RadioGroup.Root>
  </Flex>
);
