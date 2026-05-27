'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {SubsectionHeading} from './shared';

interface Props {
  evaluation: DocumentEvaluation;
}

export function CountySplitsSection({evaluation}: Props) {
  const countyPieces = evaluation.county_pieces;
  if (!countyPieces) return null;

  const entries = Object.entries(countyPieces)
    .map(([geoid, [minimum, actual, name]]) => ({geoid, minimum, actual, name}))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalCounties = entries.length;
  const splitCounties = entries.filter(e => e.actual >= 2).length;
  const unnecessarySplits = entries.filter(e => e.actual > e.minimum).length;

  return (
    <Accordion.Root type="single" collapsible defaultValue="county-splits">
      <Accordion.Item value="county-splits">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon />
            <Heading size="4">County Splits</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>
          <Text size="2" mb="3" as="p">
            A county is <strong>split</strong> when its population is divided across two or more
            districts. Some splits are unavoidable — if a county is too large for a single district,
            it must be split. The <strong>minimum possible</strong> pieces column shows the fewest
            pieces required given the county&apos;s population relative to the ideal district size.
          </Text>

          <SubsectionHeading>Summary</SubsectionHeading>
          <Table.Root size="1" mb="3">
            <Table.Body>
              <Table.Row>
                <Table.Cell><Text size="2">Total counties</Text></Table.Cell>
                <Table.Cell justify="end"><Text size="2" weight="bold">{totalCounties}</Text></Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell><Text size="2">Split counties (2+ pieces)</Text></Table.Cell>
                <Table.Cell justify="end"><Text size="2" weight="bold">{splitCounties}</Text></Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell><Text size="2">Unnecessarily split counties</Text></Table.Cell>
                <Table.Cell justify="end"><Text size="2" weight="bold">{unnecessarySplits}</Text></Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table.Root>

          <SubsectionHeading>Per-County Detail</SubsectionHeading>
          <Table.Root size="1">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>County</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Min. possible</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Actual pieces</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.map(({geoid, minimum, actual, name}) => (
                <Table.Row key={geoid}>
                  <Table.Cell>
                    <Text size="2">{name}</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2">{minimum}</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text
                      size="2"
                      weight={actual > minimum ? 'bold' : 'regular'}
                      color={actual > minimum ? 'red' : undefined}
                    >
                      {actual}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
