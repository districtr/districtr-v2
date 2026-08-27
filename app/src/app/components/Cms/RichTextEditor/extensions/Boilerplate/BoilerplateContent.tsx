import {Flex, Heading, Table, Text, Link} from '@radix-ui/themes';
import {DataIntroContent} from '@/app/components/Static/Content/DataIntroContent';

const AboutTheDataBoilerplate = (
  <Flex direction="column" gap="4">
    <Heading as="h2">About the data</Heading>
    <DataIntroContent />
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
      The shapes of all Census blocks, block groups, and VTDs were obtained from the 2020
      distribution of the US Census Bureau&apos;s{' '}
      <Link target="_blank" href="https://www.census.gov/geo/maps-data/data/tiger-line.html">
        TIGER/Line Shapefiles
      </Link>
      .
    </Text>
    <Text>
      Block-level demographic information for the 2020 decennial census was obtained from the PL
      94-171 tables available through the public{' '}
      <Link target="_blank" href="http://api.census.gov/">
        API for the US Census
      </Link>
      . Demographic data for larger geographical units in the{' '}
      <Link target="_blank" href="https://www2.census.gov/geo/pdfs/reference/geodiagram.pdf">
        US Census Geographic Hierarchy
      </Link>{' '}
      were derived by aggregating block-level populations.
    </Text>
  </Flex>
);

export const boilerplateContent = {
  AboutTheDataBoilerplate,
};
