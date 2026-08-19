import {Flex, Heading, Table, Text, Link} from '@radix-ui/themes';

const AboutTheDataBoilerplate = (
  <Flex direction="column" gap="4">
    <Heading as="h2">About the data</Heading>
    <Text>
      In our maps, you draw your own districts and communities from a given set of units or building
      blocks. Common building blocks that you&apos;ll see in our modules are <b>precincts</b>,{' '}
      <b>block groups</b>, and <b>census blocks</b>.
    </Text>
    <Text>
      <b>Precincts</b> are the smallest unit at which vote counts are reported. (Usually these
      correspond one-to-one with polling places, where you actually go to cast a vote.) Therefore,
      precincts are the smallest unit to use when you care about the most accurate election results.
      In a map built from precincts, you can explore recent election results and visualize the
      partisan lean in your state. Precinct-level data can be{' '}
      <Link target="_blank" href="/the-data-for-districtr.pdf">
        notoriously difficult to collect
      </Link>
      !
    </Text>
    <Text>
      <b>Blocks</b> and <b>block groups</b> are units created by the United States Census Bureau
      with input from representatives of individual states. <b>Blocks</b> are the smallest
      geographic unit published by the Census Bureau, and are designed to fit neatly into the
      geographic features of their surroundings (e.g. interstate highways, rivers, city blocks, and
      so on) while <b>block groups</b> are formed by grouping blocks together in ways that are more
      keyed to neighborhoods. The Census Bureau publishes major updates of geographical products
      with every decennial census, in accordance with{' '}
      <Link target="_blank" href="https://bit.ly/2QczeID">
        Public Law 94-171
      </Link>
      .
    </Text>
    <Text>
      The <strong>Decennial Census</strong> is the nationwide enumeration of every person living in
      the United States, and has been conducted every ten years since 1790. The final Census product
      is an extremely large dataset, with more than 18,000 tabulated variables, and is published at
      the block level in the Redistricting Data. The{' '}
      <strong>American Community Survey (ACS)</strong> is another large dataset produced by the
      United States Census Bureau. To collect data, the Census Bureau surveys approximately 3.5
      million households across the United States each year, and produces two data products from
      this survey: <b>1-year estimates</b> and <b>5-year estimates</b>. 1-year estimates are
      socio-economic statistics published for areas with 65,000 people or more. The{' '}
      <b>5-year estimates</b> are typically published at the block group level, though it depends on
      the variable.
    </Text>
    <Flex direction="column" gap="2">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.RowHeaderCell>Unit</Table.RowHeaderCell>
            <Table.RowHeaderCell>Source</Table.RowHeaderCell>
            <Table.RowHeaderCell>Population Size</Table.RowHeaderCell>
            <Table.RowHeaderCell>Available data</Table.RowHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>Precincts</Table.Cell>
            <Table.Cell>State/county government agencies</Table.Cell>
            <Table.Cell>500 - 3,000 voters</Table.Cell>
            <Table.Cell>Election results, demographics</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Block groups</Table.Cell>
            <Table.Cell>Census Bureau</Table.Cell>
            <Table.Cell>600 - 3,000 people</Table.Cell>
            <Table.Cell>
              Demographics, income, homeownership, broadband access, and other ACS data
            </Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>Blocks</Table.Cell>
            <Table.Cell>Census Bureau</Table.Cell>
            <Table.Cell>0 - 600 people</Table.Cell>
            <Table.Cell>Demographics only</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </Flex>
    <Text>
      <b>Demographics:</b> Population totals, voting age population, race/ethnicity
    </Text>
    <Text>
      The shapes of block groups are from the US Census Bureau&apos;s{' '}
      <Link target="_blank" href="https://www.census.gov/geo/maps-data/data/tiger-line.html">
        TIGER/Line Shapefiles
      </Link>
      . Precincts are created using the{' '}
      <Link target="_blank" href="https://github.com/mggg/maup">
        Data and Democracy Lab&apos;s proration software
      </Link>
      .
    </Text>
    <Text>
      Demographic information was downloaded at the block level from the{' '}
      <Link target="_blank" href="http://api.census.gov/">
        Census API
      </Link>
      , using the 2020 Decennial Census. Demographic data for block groups and precincts were
      aggregated from the census block level.
    </Text>
  </Flex>
);

export const boilerplateContent = {
  AboutTheDataBoilerplate,
};
