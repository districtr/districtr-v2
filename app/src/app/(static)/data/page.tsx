import {CTA} from '@/app/components/Static/Content/CTA';
import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import NextLink from 'next/link';

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4">
      <Heading as="h1" size="8">
        Data
      </Heading>
      <Text size="3">
        In our maps, you draw your own districts and communities from a given set of units or
        building blocks. Common building blocks that you&apos;ll see in our modules are{' '}
        <b>precincts</b>, <b>block groups</b>, or <b>blocks</b>.
      </Text>{' '}
      <Text size="3">
        <b>Precincts</b> are the smallest unit at which vote counts are reported. (Usually these
        correspond one-to-one with polling places, where you actually go to cast a vote.) Therefore,
        precincts are the smallest unit to use when you care about accurate election results. In a
        map built from precincts, you can explore recent election results and visualize the partisan
        lean in your state. Precinct level data can be{' '}
        <NextLink legacyBehavior href="https://districtr.org/assets/the-data-for-districtr.pdf">
          <Link target="_blank">notoriously difficult to collect</Link>
        </NextLink>
        ! In Districtr v2, we use Census VTDs, which are approximations of precinct boundaries
        collected by the Census and adjusted to be constructed out of blocks.
      </Text>
      <Text size="3">
        <b>Blocks</b> and <b>block groups</b> are units created by the United States Census Bureau
        with input from individual states. Blocks are the smallest geographic unit published by the
        Census Bureau, and attempt to fit neatly into the geographic features of their surroundings
        (e.g. interstate highways, rivers, city blocks etc.) while <b>block groups</b> are formed by
        grouping blocks together such that no two block groups share a block. The Census Bureau
        publishes geographic products, including revised block and block group geographies at least
        every decennial census, in accordance with{' '}
        <NextLink
          legacyBehavior
          href="https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html"
        >
          <Link target="_blank">Public Law 94-171</Link>
        </NextLink>
        .
      </Text>
      <Text size="3">
        The <b>Decennial Census</b> is the nationwide tallying of every person living in the United
        States, and has been conducted every ten years since 1790. The final Census product is an
        extremely large dataset, with more than 18,000 tabulated variables, and is published at the
        block level. The <b>American Community Survey (ACS)</b> is another large dataset produced by
        the United States Census Bureau. To collect data, the Census Bureau surveys approximately
        3.5 million households across the United States each year, and produces two data products
        from households across the United States each year, and produces two data products from this
        survey: <b>1-year estimates</b> and <b>5-year estimates</b>. 1-year estimates are estimated
        population statistics published for Census-designated areas with 65,000 people or more, and
        so is unsuitable for redistricting. The <b>5-year estimates</b> are estimated population
        statistics, including income and some demographic data, and are published at the block group
        level regardless of population.
      </Text>
      <Text size="3">
        To compute the demographic categories like &quot;Black&quot; and &quot;Asian&quot; in
        Districtr v2, we use collections of columns from the Decennial Census. You can read more
        about exactly which columns we use{' '}
        <NextLink legacyBehavior href="https://mggg.org/VAP-CVAP">
          <Link target="_blank">here</Link>
        </NextLink>
        . On the backend, all of our data comes from the{' '}
        <NextLink legacyBehavior href="https://mggg.org/">
          <Link target="_blank">Data and Democracy Lab</Link>
        </NextLink>{' '}
        Redistricting Lab&apos;s{' '}
        <NextLink legacyBehavior href="https://github.com/mggg/gerrydb-client-py">
          <Link target="_blank">gerrydb</Link>
        </NextLink>{' '}
        database, which stores all sorts of geospatial data.
      </Text>
      <CTA />
    </Flex>
  );
}
