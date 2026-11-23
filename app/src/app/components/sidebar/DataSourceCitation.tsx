import {Link, Text} from '@radix-ui/themes';

// Hardcoded for now — every map currently draws from the same sources.
export const DEMOGRAPHICS_SOURCE = 'U.S. Census Bureau, 2020 Decennial Census (P.L. 94-171)';
const ACS_SOURCE =
  'U.S. Census Bureau, American Community Survey 2020–2024 (5-year), at the block-group level';

/** Small gray data-source line under demographic/election tables and legends.
 * Election results are sourced on the Data page, so their line links there. */
export const DataSourceCitation: React.FC<{elections?: boolean; acs?: boolean}> = ({
  elections,
  acs,
}) => (
  <Text size="1" color="gray">
    Source:{' '}
    {elections ? (
      // A new tab, so the map being edited stays open.
      <Link href="/data" target="_blank" rel="noopener noreferrer" color="gray" underline="always">
        Districtr data page
      </Link>
    ) : acs ? (
      ACS_SOURCE
    ) : (
      DEMOGRAPHICS_SOURCE
    )}
  </Text>
);
