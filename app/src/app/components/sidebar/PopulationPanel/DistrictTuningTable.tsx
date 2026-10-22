'use client';
import React from 'react';
import {Flex, IconButton, Table, Text} from '@radix-ui/themes';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {getContiguity} from '@utils/api/apiHandlers/getContiguity';
import {formatDeviationPct, formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ConditionalScrollArea} from '../ConditionalScrollArea';

const NUM_CELL_STYLE: React.CSSProperties = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const signed = (value: number, text: string) => `${value < 0 ? '−' : '+'}${text}`;

/**
 * Super Draw's tuning view of the population chart: once every district is
 * within a few hundred people of ideal the bars all look identical, so this
 * swaps them for exact numbers and a per-district contiguity flag.
 *
 * Contiguity shares the validation panel's query key, which turns over with
 * the document's updated_at: one request per save, shared by both views.
 */
export const DistrictTuningTable: React.FC<{
  rows: {zone: number; total_pop_20?: number | null}[];
  idealPopulation?: number;
  showLocks: boolean;
  isReadOnly: boolean;
  onToggleLock: (zone: number) => void;
}> = ({rows, idealPopulation, showLocks, isReadOnly, onToggleLock}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const getZoneColor = useZoneColorGetter();
  const selectCommunity = useSelectCommunity();
  const {data: contiguity, isFetching} = useQuery({
    // Same key as MapValidation/Contiguity, so the two views share one fetch.
    queryKey: ['Contiguity', mapDocument?.document_id, mapDocument?.updated_at],
    queryFn: () => getContiguity(mapDocument),
    enabled: !!mapDocument,
    staleTime: 0,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
  const components = contiguity?.ok ? contiguity.response : undefined;

  return (
    <Flex direction="column">
      {!!idealPopulation && (
        <Text size="1" color="gray" align="right" mx="1" mb="1">
          Ideal {formatNumber(idealPopulation, NUMBER_FORMATS.STRING)}
        </Text>
      )}
      <ConditionalScrollArea shouldUseScrollableRows={rows.length > 10} maxHeight="60vh">
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>District</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={NUM_CELL_STYLE}>Pop</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={NUM_CELL_STYLE}>Deviation</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={NUM_CELL_STYLE}>%</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Contiguous</Table.ColumnHeaderCell>
              {showLocks && (
                <Table.ColumnHeaderCell>
                  <span className="sr-only">Lock</span>
                </Table.ColumnHeaderCell>
              )}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(d => {
              const population = d.total_pop_20 ?? 0;
              // An unstarted district's deviation is just -ideal; leave it blank.
              const deviation =
                idealPopulation && population > 0 ? population - idealPopulation : undefined;
              const pieces = components?.[d.zone];
              const locked = lockPaintedAreas.includes(d.zone);
              return (
                <Table.Row
                  key={d.zone}
                  onClick={() => selectCommunity(d.zone)}
                  className={`cursor-pointer ${
                    selectedZone === d.zone ? 'bg-[var(--accent-3)]' : 'hover:bg-[var(--gray-2)]'
                  }`}
                  data-testid={`district-tuning-row-${d.zone}`}
                >
                  <Table.Cell>
                    {/* The row's keyboard control; its click bubbles to the row. */}
                    <button
                      type="button"
                      aria-label={`Select district ${d.zone}`}
                      className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-8)]"
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: getZoneColor(d.zone),
                        }}
                      />
                      <Text weight={selectedZone === d.zone ? 'bold' : 'regular'}>{d.zone}</Text>
                    </button>
                  </Table.Cell>
                  <Table.Cell style={NUM_CELL_STYLE}>
                    {formatNumber(population, NUMBER_FORMATS.STRING)}
                  </Table.Cell>
                  <Table.Cell style={NUM_CELL_STYLE}>
                    {deviation !== undefined
                      ? signed(deviation, formatNumber(Math.abs(deviation), NUMBER_FORMATS.STRING)!)
                      : '—'}
                  </Table.Cell>
                  <Table.Cell style={NUM_CELL_STYLE}>
                    <Text color="gray">
                      {deviation !== undefined && idealPopulation
                        ? signed(
                            deviation,
                            formatDeviationPct(Math.abs(deviation) / idealPopulation)
                          )
                        : '—'}
                    </Text>
                  </Table.Cell>
                  {/* Dimmed while a post-save recheck is in flight. */}
                  <Table.Cell style={{opacity: isFetching ? 0.5 : 1}}>
                    {pieces === undefined ? (
                      <Text color="gray">—</Text>
                    ) : pieces === 1 ? (
                      <Text color="green">Yes</Text>
                    ) : (
                      <Text color="red" title={`${pieces} separate pieces`}>
                        No ({pieces})
                      </Text>
                    )}
                  </Table.Cell>
                  {showLocks && (
                    <Table.Cell onClick={e => e.stopPropagation()}>
                      <IconButton
                        onClick={() => onToggleLock(d.zone)}
                        variant="ghost"
                        size="1"
                        disabled={isReadOnly}
                        aria-label={
                          locked ? `Unlock district ${d.zone}` : `Lock district ${d.zone}`
                        }
                      >
                        {locked ? <LockClosedIcon /> : <LockOpen2Icon />}
                      </IconButton>
                    </Table.Cell>
                  )}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </ConditionalScrollArea>
    </Flex>
  );
};
