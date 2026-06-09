'use client';
import {useState} from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading, Select, Switch} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

interface CountySplitsSectionProps {
  evaluation: DocumentEvaluation;
}

export const CountySplitsSection: React.FC<CountySplitsSectionProps> = ({evaluation}) => {
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const setHoveredCountyGeoid = useMapControlsStore(state => state.setHoveredCountyGeoid);

  const countyPieces = evaluation.county_pieces;
  const idealPop = evaluation.ideal_population ?? null;
  const membership = evaluation.district_county_membership;

  if (!countyPieces) return null;

  const districts = Object.keys(membership ?? {})
    .map(Number)
    .sort((a, b) => a - b);

  const focusedGeoids: Set<string> | null =
    selectedDistrict === 'all'
      ? null
      : new Set(membership?.[selectedDistrict] ?? []);

  const allEntries = Object.entries(countyPieces)
    .map(([geoid, {total_pop: pop, pieces: actual, name}]) => ({geoid, pop, actual, name}))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries = focusedGeoids
    ? allEntries.filter(e => focusedGeoids.has(e.geoid))
    : allEntries;

  const splitCounties = allEntries.filter(e => e.actual >= 2).length;
  const unnecessarySplits = idealPop !== null
    ? allEntries.filter(e => e.actual > Math.ceil(e.pop / idealPop)).length
    : null;

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
            districts. The <em>districts&apos; worth</em> column shows how many ideal-sized districts
            the county&apos;s population would fill.
          </Text>

          <Flex align="center" gap="2" mb="3" justify="end">
            <Text size="1" color="gray">County boundaries</Text>
            <Switch
              size="1"
              checked={mapOptions.showCountyBoundaries ?? false}
              onCheckedChange={checked =>
                setMapOptions({showCountyBoundaries: checked, prominentCountyNames: checked})
              }
            />
          </Flex>

          <Heading size="2" align="center" mb="2" mt="4">Summary</Heading>
          <Table.Root size="1" mb="3">
            <Table.Body>
              <Table.Row>
                <Table.Cell><Text size="2">Total counties</Text></Table.Cell>
                <Table.Cell justify="end">
                  <Text size="2" weight="bold">{allEntries.length}</Text>
                </Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell><Text size="2">Split counties (2+ pieces)</Text></Table.Cell>
                <Table.Cell justify="end">
                  <Text size="2" weight="bold">{splitCounties}</Text>
                </Table.Cell>
              </Table.Row>
              {unnecessarySplits !== null && (
                <Table.Row>
                  <Table.Cell><Text size="2">Unnecessarily split counties</Text></Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2" weight="bold">{unnecessarySplits}</Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Root>

          <Heading size="2" align="center" mb="2" mt="4">Per-County Detail</Heading>
          {districts.length > 0 && (
            <Flex align="center" gap="2" mb="2" justify="end">
              <Text size="1" color="gray">Focus on</Text>
              <Select.Root value={selectedDistrict} onValueChange={setSelectedDistrict} size="1">
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="all">All districts</Select.Item>
                  {districts.map(d => (
                    <Select.Item key={d} value={String(d)}>District {d}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          )}
          {idealPop !== null && (
            <Text size="2" mb="2" as="p">
              The ideal district population for this plan is{' '}
              <strong>{idealPop.toLocaleString()}</strong>.
            </Text>
          )}
          <div className={entries.length > 15 ? 'max-h-[400px] overflow-y-auto print:max-h-none print:overflow-visible' : undefined}>
            <Table.Root size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>County Name</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    County<br />Population
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    How Many Districts&apos;<br />Worth
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">
                    Pieces in<br />This Plan
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {entries.map(({geoid, pop, actual, name}) => {
                  const worth = idealPop !== null ? pop / idealPop : null;
                  const minimum = worth !== null ? Math.ceil(worth) : null;
                  const unnecessary = minimum !== null && actual > minimum;
                  return (
                    <Table.Row
                      key={geoid}
                      tabIndex={0}
                      onMouseEnter={() => setHoveredCountyGeoid(geoid)}
                      onMouseLeave={() => setHoveredCountyGeoid(null)}
                      onFocus={() => setHoveredCountyGeoid(geoid)}
                      onBlur={() => setHoveredCountyGeoid(null)}
                      style={{cursor: 'default'}}
                    >
                      <Table.Cell>
                        <Text size="2">{name}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{pop.toLocaleString()}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{worth !== null ? worth.toFixed(2) : '—'}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2" weight={unnecessary ? 'bold' : 'regular'} color={unnecessary ? 'red' : undefined}>
                          {actual}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
