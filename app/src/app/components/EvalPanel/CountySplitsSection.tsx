'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading, Switch} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {type GeoUnit, GEO_UNITS, GEO_UNIT_LABELS} from '@constants/document/geoUnits';

const GEO_UNIT_DESCRIPTIONS: Record<GeoUnit, string> = {
  [GEO_UNITS.VTD]:
    'VTDs, also called "voting tabulation districts" or "voting districts," are the closest approximation of electoral precincts in Census geography.',
  [GEO_UNITS.BLOCK_GROUP]:
    'Block groups are Census geographic units that nest within counties and tracts, typically containing 600–3,000 people.',
  [GEO_UNITS.BLOCK]:
    'Census blocks are the smallest Census geographic unit, corresponding roughly to city blocks.',
};

interface CountySplitsSectionProps {
  evaluation: DocumentEvaluation;
}

export const CountySplitsSection: React.FC<CountySplitsSectionProps> = ({evaluation}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const setHoveredCountyGeoid = useMapControlsStore(state => state.setHoveredCountyGeoid);

  const countyPieces = evaluation.county_pieces;
  const idealPop = evaluation.ideal_population ?? null;
  const assignedUnits = evaluation.assigned_units;

  const unitLabel = mapDocument
    ? GEO_UNIT_LABELS[mapDocument.parent_geo_unit_type]
    : null;
  const unitDescription = mapDocument
    ? GEO_UNIT_DESCRIPTIONS[mapDocument.parent_geo_unit_type]
    : null;
  if (!countyPieces) return null;

  const allEntries = Object.entries(countyPieces)
    .map(([geoid, {total_pop: pop, pieces: actual, name}]) => ({geoid, pop, actual, name}))
    .sort((a, b) => a.name.localeCompare(b.name));

  const splitCounties = allEntries.filter(e => e.actual >= 2).length;
  const unnecessarySplits =
    idealPop !== null
      ? allEntries.filter(e => e.actual > Math.ceil(e.pop / idealPop)).length
      : null;

  // Derived unit assignment counts
  const unitSplitCount = assignedUnits?.split_count ?? 0;
  const unitPartialCount = assignedUnits?.partially_assigned_count ?? 0;
  const unitAssignedCount = assignedUnits?.assigned_count ?? 0;
  const unitTotalCount = assignedUnits?.total_count ?? null;
  const unitUnassignedCount =
    unitTotalCount !== null
      ? unitTotalCount - unitAssignedCount - unitSplitCount - unitPartialCount
      : null;

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="splits">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full group" py="2">
            <TriangleRightIcon width={16} height={16} className="transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <Heading size="4">Splits</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>
          {/* Unit Assignment */}
          <Heading size="3" align="center" mb="2" mt="4">
            Higher-level Unit Splits
          </Heading>
          {unitLabel && (
            <Text size="2" as="p" mb="2">
              This map uses <strong>{unitLabel}</strong> as the default unit of drawing.
              {unitDescription && <> {unitDescription}</>}
            </Text>
          )}
          {assignedUnits && unitTotalCount !== null && (
            <div style={{width: 'fit-content', borderRight: '1px solid var(--gray-a5)'}}>
            <Table.Root size="1" mb="3">
              <Table.Body>
                <Table.Row>
                  <Table.Cell>
                    <Text size="2">Total {unitLabel ?? 'units'}</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2" weight="bold">
                      {unitTotalCount.toLocaleString()}
                    </Text>
                  </Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell>
                    <Text size="2">Fully assigned to one district</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2" weight="bold">
                      {unitAssignedCount.toLocaleString()}
                    </Text>
                  </Table.Cell>
                </Table.Row>
                {unitSplitCount > 0 && (
                  <Table.Row>
                    <Table.Cell>
                      <Text size="2">Fully assigned but split across districts</Text>
                    </Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold" color="orange">
                        {unitSplitCount.toLocaleString()}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
                {unitPartialCount > 0 && (
                  <Table.Row>
                    <Table.Cell>
                      <Text size="2">Partially assigned</Text>
                    </Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold" color="orange">
                        {unitPartialCount.toLocaleString()}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
                {unitUnassignedCount !== null && unitUnassignedCount > 0 && (
                  <Table.Row>
                    <Table.Cell>
                      <Text size="2">Unassigned</Text>
                    </Table.Cell>
                    <Table.Cell justify="end">
                      <Text size="2" weight="bold" color="red">
                        {unitUnassignedCount.toLocaleString()}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>
            </div>
          )}

          {/* County Splits */}
          <Heading size="3" align="center" mb="2" mt="4">
            County Splits
          </Heading>
          <Text size="2" mb="3" as="p">
            A county is <strong>split</strong> when its population is divided across two or more
            districts. The <em>districts&apos; worth</em> column shows how many ideal-sized
            districts the county&apos;s population would fill.
          </Text>

          <Flex align="center" gap="2" mb="3" justify="end">
            <Text size="1" color="gray">
              County boundaries
            </Text>
            <Switch
              size="1"
              checked={mapOptions.showCountyBoundaries ?? false}
              onCheckedChange={checked =>
                setMapOptions({showCountyBoundaries: checked, prominentCountyNames: checked})
              }
            />
          </Flex>

          <Text size="2" weight="bold" mb="2" mt="4" as="p">
            Summary
          </Text>
          <div style={{width: 'fit-content', borderRight: '1px solid var(--gray-a5)'}}>
          <Table.Root size="1" mb="3">
            <Table.Body>
              <Table.Row>
                <Table.Cell>
                  <Text size="2">Total counties</Text>
                </Table.Cell>
                <Table.Cell justify="end">
                  <Text size="2" weight="bold">
                    {allEntries.length}
                  </Text>
                </Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>
                  <Text size="2">Split counties (2+ pieces)</Text>
                </Table.Cell>
                <Table.Cell justify="end">
                  <Text size="2" weight="bold">
                    {splitCounties}
                  </Text>
                </Table.Cell>
              </Table.Row>
              {unnecessarySplits !== null && (
                <Table.Row>
                  <Table.Cell>
                    <Text size="2">Unnecessarily split counties</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2" weight="bold">
                      {unnecessarySplits}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Root>
          </div>

          <Text size="2" weight="bold" mb="2" mt="4" as="p">
            Overly Split Counties
          </Text>
          {idealPop !== null && (
            <Text size="2" mb="2" as="p">
              The ideal district population for this plan is{' '}
              <strong>{idealPop.toLocaleString()}</strong>.
            </Text>
          )}
          {(() => {
            const unnecessarySplitEntries =
              idealPop !== null
                ? allEntries.filter(e => e.actual > Math.ceil(e.pop / idealPop))
                : [];
            if (idealPop === null) {
              return (
                <Text size="2" color="gray" mb="3" as="p">
                  Population targets not yet available.
                </Text>
              );
            }
            if (unnecessarySplitEntries.length === 0) {
              return (
                <Text size="2" color="gray" mb="3" as="p">
                  No counties are split more than necessary.
                </Text>
              );
            }
            return (
              <div
                className={
                  unnecessarySplitEntries.length > 15
                    ? 'max-h-[400px] overflow-y-auto print:max-h-none print:overflow-visible'
                    : undefined
                }
                style={{width: 'fit-content', borderRight: '1px solid var(--gray-a5)'}}
              >
                <Table.Root size="1">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>County Name</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">
                        County
                        <br />
                        Population
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">
                        How Many
                        <br />
                        Districts&apos; Worth
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">
                        Pieces in
                        <br />
                        This Plan
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {unnecessarySplitEntries.map(({geoid, pop, actual, name}) => {
                      const worth = pop / idealPop;
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
                            <Text size="2">{worth.toFixed(2)}</Text>
                          </Table.Cell>
                          <Table.Cell justify="end">
                            <Text size="2">{actual}</Text>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              </div>
            );
          })()}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
