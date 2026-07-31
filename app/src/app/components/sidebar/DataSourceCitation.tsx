import {Text} from '@radix-ui/themes';

// Hardcoded for now — every map currently draws from the same sources.
const DEMOGRAPHICS_CITATION = 'Source: U.S. Census Bureau, 2020 Decennial Census (P.L. 94-171)';
const ELECTIONS_CITATION = "Source: Dave's Redistricting App";

/** Small gray data-source line under demographic/election tables and legends. */
export const DataSourceCitation: React.FC<{elections?: boolean}> = ({elections}) => (
  <Text size="1" color="gray">
    {elections ? ELECTIONS_CITATION : DEMOGRAPHICS_CITATION}
  </Text>
);
