import {CTA} from '@/app/components/Static/Content/CTA';
import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import {LearnSubNav} from '@/app/components/Static/LearnSubNav';

export const metadata = {
  title: 'Data',
  description: 'The data sources behind Districtr maps',
};

export default function DataPage() {
  return (
    <Flex direction="column" gapY="4">
      <LearnSubNav />
      <Heading as="h1" size="8">
        Data
      </Heading>
      <Text size="3">
        In our maps, you draw your own districts and communities from a given set of units or
        building blocks. Common building blocks that you&apos;ll see in our modules are{' '}
        <b>precincts</b>, <b>block groups</b>, and <b>census blocks</b>.
      </Text>{' '}
      <Text size="3">
        <b>Precincts</b> are the smallest unit at which vote counts are reported. (Usually these
        correspond one-to-one with polling places, where you actually go to cast a vote.) Therefore,
        precincts are the smallest unit to use when you care about the most accurate election
        results. In a map built from precincts, you can explore recent election results and
        visualize the partisan lean in your state. Precinct-level data can be{' '}
        <Link href="/the-data-for-districtr.pdf" target="_blank">
          notoriously difficult to collect
        </Link>
        ! In Districtr v2, we rely on Census VTDs, which are approximations of local precinct
        boundaries collected by the Census and adjusted to be constructed out of blocks.
      </Text>
      <Text size="3">
        <b>Blocks</b> and <b>block groups</b> are units created by the United States Census Bureau
        with input from representatives of individual states. Blocks are the smallest geographic
        unit published by the Census Bureau, and are designed to fit neatly into the geographic
        features of their surroundings (e.g. interstate highways, rivers, city blocks, and so on)
        while <b>block groups</b> are formed by grouping blocks together in ways that are more keyed
        to neighborhoods. The Census Bureau publishes major updates of geographical products with
        every decennial census, in accordance with{' '}
        <Link
          href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html"
          target="_blank"
        >
          Public Law 94-171
        </Link>
        .
      </Text>
      <Text size="3">
        The <b>Decennial Census</b> is the nationwide enumeration of every person living in the
        United States, and has been conducted every ten years since 1790. The final Census product
        is an extremely large dataset, with more than 18,000 tabulated variables, and is published
        at the block level in the Redistricting Data. The <b>American Community Survey (ACS)</b> is
        another large dataset produced by the United States Census Bureau. To collect data, the
        Census Bureau surveys approximately 3.5 million households across the United States each
        year, and produces two data products from this survey: <b>1-year estimates</b> and{' '}
        <b>5-year estimates</b>. 1-year estimates are socio-economic statistics published for areas
        with 65,000 people or more. The <b>5-year estimates</b> are typically published at the block
        group level, though it depends on the variable.
      </Text>
      <Text size="3">
        To compute the demographic categories like &quot;Black&quot; and &quot;Asian&quot; in
        Districtr v2, we use collections of columns from the Decennial Census. You can read more
        about exactly which columns we use{' '}
        <Link href="https://data-democracy.org/VAP-CVAP" target="_blank">
          here
        </Link>
        . On the backend, all of our data comes from the{' '}
        <Link href="https://data-democracy.org/" target="_blank">
          Data and Democracy Lab
        </Link>
        &apos;s{' '}
        <Link href="https://github.com/mggg/gerrydb-client-py" target="_blank">
          gerrydb
        </Link>{' '}
        database, which stores all sorts of geospatial data.
      </Text>
      <Text size="3">
        For most of our election results, we rely on the tabulations created by the team at{' '}
        <Link href="https://davesredistricting.org" target="_blank">
          Dave&apos;s Redistricting
        </Link>
        .
      </Text>
      <CTA />
    </Flex>
  );
}
