import {Text, Link} from '@radix-ui/themes';

/**
 * The precincts/blocks/block-groups explainer, shared between the Data page
 * and the CMS's "About the data" boilerplate snippet — previously duplicated
 * by hand in both places.
 */
export const DataIntroContent: React.FC<{textSize?: React.ComponentProps<typeof Text>['size']}> = ({
  textSize,
}) => (
  <>
    <Text size={textSize}>
      In our maps, you draw your own districts and communities from a given set of units or building
      blocks. Common building blocks that you&apos;ll see in our modules are <b>precincts</b>,{' '}
      <b>block groups</b>, and <b>census blocks</b>.
    </Text>
    <Text size={textSize}>
      <b>Precincts</b> are the smallest unit at which vote counts are reported. (Usually these
      correspond one-to-one with polling places, where you actually go to cast a vote.) Therefore,
      precincts are the smallest unit to use when you care about the most accurate election results.
      In a map built from precincts, you can explore recent election results and visualize the
      partisan lean in your state. Precinct-level data can be{' '}
      <Link href="/the-data-for-districtr.pdf" target="_blank">
        notoriously difficult to collect
      </Link>
      ! In Districtr v2, we rely on Census VTDs, which are approximations of local precinct
      boundaries collected by the Census and adjusted to be constructed out of blocks.
    </Text>
    <Text size={textSize}>
      <b>Blocks</b> and <b>block groups</b> are units created by the United States Census Bureau
      with input from representatives of individual states. Blocks are the smallest geographic unit
      published by the Census Bureau, and are designed to fit neatly into the geographic features of
      their surroundings (e.g. interstate highways, rivers, city blocks, and so on) while{' '}
      <b>block groups</b> are formed by grouping blocks together in ways that are more keyed to
      neighborhoods. The Census Bureau publishes major updates of geographical products with every
      decennial census, in accordance with{' '}
      <Link
        href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html"
        target="_blank"
      >
        Public Law 94-171
      </Link>
      .
    </Text>
    <Text size={textSize}>
      The <b>Decennial Census</b> is the nationwide enumeration of every person living in the United
      States, and has been conducted every ten years since 1790. The final Census product is an
      extremely large dataset, with more than 18,000 tabulated variables, and is published at the
      block level in the Redistricting Data. The <b>American Community Survey (ACS)</b> is another
      large dataset produced by the United States Census Bureau. To collect data, the Census Bureau
      surveys approximately 3.5 million households across the United States each year, and produces
      two data products from this survey: <b>1-year estimates</b> and <b>5-year estimates</b>.
      1-year estimates are socio-economic statistics published for areas with 65,000 people or more.
      The <b>5-year estimates</b> are typically published at the block group level, though it
      depends on the variable.
    </Text>
  </>
);
