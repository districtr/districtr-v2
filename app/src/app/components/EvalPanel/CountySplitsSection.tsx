'use client';
import {useState} from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading, Switch, Select} from '@radix-ui/themes';
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
  const [showMode, setShowMode] = useState<'overly-split-only' | 'all'>('overly-split-only');

  const countyPieces = evaluation.county_pieces;
  const idealPop = evaluation.ideal_population ?? null;
  const assignedUnits = evaluation.assigned_units;

  const unitLabel = mapDocument ? GEO_UNIT_LABELS[mapDocument.parent_geo_unit_type] : null;
  const unitDescription = mapDocument
    ? GEO_UNIT_DESCRIPTIONS[mapDocument.parent_geo_unit_type]
    : null;
  if (!countyPieces) return null;

  const allEntries = Object.entries(countyPieces)
    .map(([geoid, {total_pop: pop, pieces: actual, name}]) => ({geoid, pop, actual, name}))
    .sort((a, b) => a.name.localeCompare(b.name));

  const splitCounties = allEntries.filter(e => e.actual >= 2).length;
  const overlySplitSet =
    idealPop !== null
      ? new Set(allEntries.filter(e => e.actual > Math.ceil(e.pop / idealPop)).map(e => e.geoid))
      : new Set<string>();
  const unnecessarySplits = idealPop !== null ? overlySplitSet.size : null;

  const displayedEntries =
    showMode === 'overly-split-only'
      ? allEntries.filter(e => overlySplitSet.has(e.geoid))
      : allEntries;

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
            <TriangleRightIcon
              width={16}
              height={16}
              className="transition-transform duration-200 group-data-[state=open]:rotate-90"
            />
            <Heading size="5">Splits</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content className="pl-8">
          {/* Unit Assignment */}
          <Heading size="3" align="center" mb="2" mt="4">
            Unit Splits
          </Heading>
          {unitLabel && (
            <Text size="2" as="p" mb="2">
              This map uses <strong>{unitLabel}</strong> as the default unit of drawing.
              {unitDescription && <> {unitDescription}</>}
            </Text>
          )}
          {assignedUnits && unitTotalCount !== null && (
            <Text size="2" as="p" mb="2">
              {(() => {
                const fullyAssigned = unitAssignedCount + unitSplitCount;
                const label = unitLabel ?? 'units';
                return (
                  <>
                    Out of the total <strong>{unitTotalCount.toLocaleString()}</strong> {label},{' '}
                    <strong>{fullyAssigned.toLocaleString()}</strong> are fully assigned
                    {unitSplitCount > 0 && (
                      <>
                        {' '}
                        (<strong>{unitAssignedCount.toLocaleString()}</strong> whole and{' '}
                        <strong>{unitSplitCount.toLocaleString()}</strong> split)
                      </>
                    )}
                    {unitPartialCount > 0 && (
                      <>
                        , with{' '}
                        <Text as="span" color="orange" weight="bold">
                          {unitPartialCount.toLocaleString()}
                        </Text>{' '}
                        partially assigned
                      </>
                    )}
                    {unitUnassignedCount !== null && unitUnassignedCount > 0 && (
                      <>
                        {' '}
                        and <strong>{unitUnassignedCount.toLocaleString()}</strong> unassigned
                      </>
                    )}
                    .
                  </>
                );
              })()}
            </Text>
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
          <div style={{width: 'fit-content'}}>
            <Table.Root size="1" mb="3" variant="surface">
              <Table.Body>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">Total counties</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold">
                      {allEntries.length}
                    </Text>
                  </Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">Split counties (2+ pieces)</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold">
                      {splitCounties}
                    </Text>
                  </Table.Cell>
                </Table.Row>
                {unnecessarySplits !== null && (
                  <Table.Row>
                    <Table.Cell justify="center">
                      <Text size="2">Unnecessarily split counties</Text>
                    </Table.Cell>
                    <Table.Cell justify="center">
                      <Text size="2" weight="bold">
                        {unnecessarySplits}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>
          </div>

          <Flex align="center" gap="2" mb="2" mt="4" justify="end">
            <Text size="2" weight="bold">
              Counties
            </Text>
            <Flex align="center" gap="1" style={{marginLeft: 'auto'}}>
              <Text size="1" color="gray">
                Show
              </Text>
              <Select.Root
                size="1"
                value={showMode}
                onValueChange={v => setShowMode(v as 'overly-split-only' | 'all')}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="overly-split-only">unnecessarily split counties</Select.Item>
                  <Select.Item value="all">all counties</Select.Item>
                </Select.Content>
              </Select.Root>
            </Flex>
          </Flex>
          {idealPop !== null && (
            <Text size="2" mb="2" as="p">
              The ideal district population for this plan is{' '}
              <strong>{idealPop.toLocaleString()}</strong>.
            </Text>
          )}
          {idealPop === null ? (
            <Text size="2" color="gray" mb="3" as="p">
              Population targets not yet available.
            </Text>
          ) : displayedEntries.length === 0 ? (
            <Text size="2" color="gray" mb="3" as="p">
              No counties are split more than necessary.
            </Text>
          ) : (
            // See https://github.com/radix-ui/themes/issues/584 and /767 —
            // Table.Root wraps in ScrollArea (overflow:scroll) which breaks position:sticky.
            // Workaround: use Radix CSS classes on our own scroll div + plain <table>.
            <div
              className="rt-TableRoot rt-r-size-1 rt-variant-surface"
              style={{width: 'fit-content'}}
            >
              <div
                className={
                  displayedEntries.length > 15
                    ? 'max-h-[400px] overflow-y-auto [scrollbar-gutter:stable] print:max-h-none print:overflow-visible'
                    : ''
                }
              >
                <table className="rt-TableRootTable" style={{overflow: 'visible'}}>
                  <Table.Header
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      backgroundColor: 'var(--color-panel-solid)',
                    }}
                  >
                    <Table.Row>
                      <Table.ColumnHeaderCell justify="center">County Name</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">
                        County
                        <br />
                        Population
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">
                        How Many
                        <br />
                        Districts&apos; Worth
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell
                        justify="center"
                        style={{paddingRight: 'calc(var(--table-cell-padding) + 8px)'}}
                      >
                        Pieces in
                        <br />
                        This Plan
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {displayedEntries.map(({geoid, pop, actual, name}) => {
                      const worth = idealPop !== null ? pop / idealPop : null;
                      const isOverlySplit = overlySplitSet.has(geoid);
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
                          <Table.Cell justify="center">
                            <Text size="2">{name}</Text>
                          </Table.Cell>
                          <Table.Cell justify="center">
                            <Text size="2">{pop.toLocaleString()}</Text>
                          </Table.Cell>
                          <Table.Cell justify="center">
                            <Text size="2">{worth !== null ? worth.toFixed(2) : '—'}</Text>
                          </Table.Cell>
                          <Table.Cell
                            justify="center"
                            style={{paddingRight: 'calc(var(--table-cell-padding) + 8px)'}}
                          >
                            <Text size="2" color={isOverlySplit ? 'red' : undefined}>
                              {actual}
                            </Text>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </table>
              </div>
            </div>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
