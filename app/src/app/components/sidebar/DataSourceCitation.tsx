import {Text} from '@radix-ui/themes';

// Hardcoded for now — every map currently draws from the same sources.
export const DEMOGRAPHICS_SOURCE = 'U.S. Census Bureau, 2020 Decennial Census (P.L. 94-171)';
export const ELECTIONS_SOURCE = "Dave's Redistricting App";
const ACS_SOURCE =
  'U.S. Census Bureau, American Community Survey 2020–2024 (5-year), at the block-group level';

/** Small gray data-source line under demographic/election tables and legends. */
export const DataSourceCitation: React.FC<{elections?: boolean; acs?: boolean}> = ({
  elections,
  acs,
}) => (
  <Text size="1" color="gray">
    Source: {elections ? ELECTIONS_SOURCE : acs ? ACS_SOURCE : DEMOGRAPHICS_SOURCE}
  </Text>
);
