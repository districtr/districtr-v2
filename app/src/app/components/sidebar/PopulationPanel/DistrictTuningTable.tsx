'use client';
import React from 'react';
import {Flex, IconButton, Table, Text, Tooltip} from '@radix-ui/themes';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {contiguityQueryKey, getContiguity} from '@utils/api/apiHandlers/getContiguity';
import {formatNumber, signedNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {ConditionalScrollArea} from '../ConditionalScrollArea';

const NUM_CELL_STYLE: React.CSSProperties = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

/**
 * Super Draw's tuning view of the population chart: once every district is
 * within a few hundred people of ideal the bars all look identical, so this
 * swaps them for exact numbers and a per-district contiguity flag.
 *
 * Contiguity shares one cache entry (contiguityQueryKey) with the validation
 * panel and the draft-status helper. The key turns over with the document's
 * updated_at, so the check runs once per save; between saves the column is
 * marked stale rather than refetched.
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
    queryKey: contiguityQueryKey(mapDocument),
    queryFn: () => getContiguity(mapDocument),
    // The endpoint resolves by public_id. staleTime Infinity (as in
    // useDraftStatusCriteria): the key already encodes freshness, so toggling
    // the view back on must not re-hit the endpoint.
    enabled: !!mapDocument?.public_id,
    staleTime: Infinity,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
  const components = contiguity?.ok ? contiguity.response : undefined;
  // Population updates as you paint, contiguity only on save. Editors only:
  // a viewer's map can't be out of date with itself.
  const {isOutdated, save} = useMapSaveStatus();
  const stale = isOutdated && !isReadOnly;

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
                    {deviation !== undefined ? signedNumber(deviation) : '—'}
                  </Table.Cell>
                  {/* Grey while unsaved edits make the last verdict stale;
                      dimmed while a post-save recheck is in flight. */}
                  <Table.Cell style={{opacity: isFetching ? 0.5 : 1}}>
                    {pieces === undefined ? (
                      <Text color="gray">—</Text>
                    ) : (
                      <Text color={stale ? 'gray' : pieces === 1 ? 'green' : 'red'}>
                        {/* Visually "No (3)"; read as "No (3 components)". */}
                        {pieces === 1 ? (
                          'Yes'
                        ) : (
                          <>
                            No ({pieces}
                            <span className="sr-only">&nbsp;components</span>)
                          </>
                        )}
                        {stale && <span className="sr-only">, as of the last save</span>}
                      </Text>
                    )}
                  </Table.Cell>
                  {showLocks && (
                    <Table.Cell onClick={e => e.stopPropagation()}>
                      <Tooltip
                        content={
                          locked
                            ? 'Unlock this district to allow painting over it'
                            : "Lock this district so it can't be painted over"
                        }
                      >
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
                      </Tooltip>
                    </Table.Cell>
                  )}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </ConditionalScrollArea>
      {stale && (
        <Text size="1" color="gray" mx="1" mt="1">
          Contiguity is from the last save.{' '}
          {/* The topbar cloud button's save. */}
          <button
            type="button"
            onClick={() => save(false, {silent: true})}
            className="inline cursor-pointer font-semibold text-districtrBlue hover:underline underline-offset-2"
          >
            Save now
          </button>
        </Text>
      )}
      {/* Otherwise a failed check reads like a row of unstarted districts. */}
      {contiguity?.ok === false && (
        <Text size="1" color="red" mx="1" mt="1">
          Contiguity unavailable: {contiguity.error.detail}
        </Text>
      )}
    </Flex>
  );
};
