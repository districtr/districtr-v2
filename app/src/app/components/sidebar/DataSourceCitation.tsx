import {Link, Text} from '@radix-ui/themes';

// Hardcoded for now — every map currently draws from the same sources.
const DEMOGRAPHICS_CITATION = 'Source: U.S. Census Bureau, 2020 Decennial Census (P.L. 94-171)';
const ACS_CITATION =
  'Source: U.S. Census Bureau, American Community Survey 2020–2024 (5-year), at the block-group level';

/** Small gray data-source line under demographic/election tables and legends.
 * Election results come from more than one source, so they link to the Data
 * page rather than naming one. */
export const DataSourceCitation: React.FC<{elections?: boolean; acs?: boolean}> = ({
  elections,
  acs,
}) => (
  <Text size="1" color="gray">
    {elections ? (
      // A new tab, so the map being edited stays open.
      <Link href="/data" target="_blank" rel="noopener noreferrer" color="gray" underline="always">
        Data sourcing
      </Link>
    ) : acs ? (
      ACS_CITATION
    ) : (
      DEMOGRAPHICS_CITATION
    )}
  </Text>
);
