import {Flex, Heading, Table, Text, Link} from '@radix-ui/themes';

const AboutTheDataBoilerplate = (
  <Flex direction="column" gap="4">
    <Heading as="h2">About the data</Heading>
    <Text>
      In our maps, you draw your own districts and communities from a given set of units or building
      blocks. Common building blocks that you&apos;ll see in our modules are <b>precincts</b>,{' '}
      <b>block groups</b>, or <b>blocks</b>.
    </Text>
    <Text>
      <b>Precincts</b> are the smallest unit at which vote counts are reported. (Usually these
      correspond one-to-one with polling places, where you actually go to cast a vote.) Therefore,
      precincts are the smallest unit to use when you care about accurate election results. In a map
      built from precincts, you can explore recent election results and visualize the partisan lean
      in your state. Precinct level data can be{' '}
      <Link target="_blank" href="https://districtr.org/assets/the-data-for-districtr.pdf">
        notoriously difficult to collect
      </Link>
      !
    </Text>
    <Text>
      <b>Blocks</b> and <b>block groups</b> are units created by the United States Census Bureau
      with input from individual states. <b>Blocks</b> are the smallest geographic unit published by
      the Census Bureau, and attempt to fit neatly into the geographic features of their
      surroundings (e.g. interstate highways, rivers, city blocks etc.) while <b>block groups</b>{' '}
      are formed by grouping blocks together such that no two block groups share a block. The Census
      Bureau publishes geographic products, including revised block and block group geographies at
      least every decennial census, in accordance with{' '}
      <Link target="_blank" href="https://bit.ly/2QczeID">
        Public Law 94-171
      </Link>
      .
    </Text>
    <Text>
      The <strong>Decennial Census</strong> is the nationwide tallying of every person living in the
      United States, and has been conducted every ten years since 1790. The final Census product is
      an extremely large dataset, with more than 18,000 tabulated variables, and is published at the
      block level. The <strong>American Community Survey (ACS)</strong> is another large dataset
      produced by the United States Census Bureau. To collect data, the Census Bureau surveys
      approximately 3.5 million households across the United States each year, and produces two data
      products from this survey: <b>1-year estimates</b> and <b>5-year estimates</b>.{' '}
      <b>1-year estimates</b>
      are estimated population statistics published for Census-designated areas with 65,000 people
      or more, and so is unsuitable for redistricting. The
      <b>5-year estimates</b> are estimated population statistics, including income and some
      demographic data, and are published at the block group level regardless of population.
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
      Precincts for certain counties were not included in the shapefile provided by the
      Demographer's Office and were digitized from maps provided by the county. Those counties are:
      Boulder, Denver, Douglas, and El Paso. For Las Animas county, the voter file was geocoded and
      used to identify precinct boundaries. Demographic data were aggregated from the census block
      level and precincts were assigned to districts using{' '}
      <Link target="_blank" href="https://github.com/mggg/maup">
        MGGG's proration software
      </Link>
      .
    </Text>
    <Heading as="h3">Census Block Groups</Heading>
    <Text>
      These data were obtained from the US Census Bureau. The block group shapefiles for the Nation
      were downloaded from the Census's{' '}
      <Link target="_blank" href="https://www.census.gov/geo/maps-data/data/tiger-line.html">
        TIGER/Line Shapefiles
      </Link>
      . Demographic information from the 2010 Decennial Census was downloaded at the block level
      from the{' '}
      <Link target="_blank" href="http://api.census.gov/">
        Census API
      </Link>
      .
    </Text>
  </Flex>
);

export const boilerplateContent = {
  AboutTheDataBoilerplate,
};
