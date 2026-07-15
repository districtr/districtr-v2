'use client';
import {Flex, SegmentedControl, Text} from '@radix-ui/themes';

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
    <SegmentedControl.Root size="1" value={pov} onValueChange={v => setPov(v as Pov)}>
      <SegmentedControl.Item value="dem">Democratic</SegmentedControl.Item>
      <SegmentedControl.Item value="rep">Republican</SegmentedControl.Item>
    </SegmentedControl.Root>
  </Flex>
);
