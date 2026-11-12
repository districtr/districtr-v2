'use client';
import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Table, Text} from '@radix-ui/themes';
import {DistrictLabel} from './DistrictLabel';
import {hoverHandlers} from './HoverTrigger';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {useZoomToDistrict} from '@/app/hooks/useZoomToDistrict';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';

const ROWS_PER_COLUMN = 10;
const MAX_COLUMNS = 3;
// Room kept free for the table's border and the scrollbar gutter.
const WIDTH_RESERVE = 20;

interface CompactnessScoreTableProps {
  polsbyPopper: Record<string, number>;
  reock?: Record<string, number>;
}

/**
 * Per-district compactness scores. Districts fill up to three side-by-side columns
 * of ROWS_PER_COLUMN rows, read down each column; beyond that the columns grow and
 * scroll together in a window ROWS_PER_COLUMN rows tall. A panel too narrow for the
 * columns gets as many as fit.
 */
export const CompactnessScoreTable: React.FC<CompactnessScoreTableProps> = ({
  polsbyPopper,
  reock,
}) => {
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();
  const zoomToDistrict = useZoomToDistrict();
  const zones = useMemo(
    () => Object.keys(polsbyPopper).sort((a, b) => Number(a) - Number(b)),
    [polsbyPopper]
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [columnsThatFit, setColumnsThatFit] = useState(MAX_COLUMNS);
  const [scrollWindowHeight, setScrollWindowHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const column = wrapper.querySelector('table');
      const firstRow = column?.tBodies[0]?.rows[0];
      if (!column || !firstRow || !column.offsetWidth) return;
      const fit = Math.floor((wrapper.clientWidth - WIDTH_RESERVE) / column.offsetWidth);
      setColumnsThatFit(Math.max(1, Math.min(MAX_COLUMNS, fit)));
      setScrollWindowHeight(
        (column.tHead?.offsetHeight ?? 0) + ROWS_PER_COLUMN * firstRow.offsetHeight
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [zones.length]);

  const columnCount = Math.max(
    1,
    Math.min(columnsThatFit, Math.ceil(zones.length / ROWS_PER_COLUMN))
  );
  const rowsPerColumn = Math.ceil(zones.length / columnCount);
  const scrolls = rowsPerColumn > ROWS_PER_COLUMN;
  const columns = Array.from({length: columnCount}, (_, i) =>
    zones.slice(i * rowsPerColumn, (i + 1) * rowsPerColumn)
  );

  return (
    <div ref={wrapperRef}>
      {/* Table.Root wraps its table in a ScrollArea (overflow: scroll), which breaks
          position: sticky on Table.Header and cannot hold several tables
          (https://github.com/radix-ui/themes/issues/584, /767). Radix's own CSS
          classes on our scroll container and plain <table>s give the same look;
          the Table sub-components do not depend on Table.Root. */}
      <div
        className="rt-TableRoot rt-r-size-1 rt-variant-surface"
        style={{width: 'fit-content', maxWidth: '100%', overflow: 'hidden'}}
      >
        <div
          className={`overflow-x-auto ${
            scrolls
              ? 'overflow-y-auto [scrollbar-gutter:stable] print:!max-h-none print:!overflow-visible'
              : ''
          }`}
          style={scrolls && scrollWindowHeight ? {maxHeight: scrollWindowHeight} : undefined}
        >
          <div className="flex items-start">
            {columns.map((columnZones, columnIndex) => {
              const isLastColumn = columnIndex === columnCount - 1;
              const lastCellPadding = isLastColumn
                ? {paddingRight: 'calc(var(--table-cell-padding) + 8px)'}
                : undefined;
              return (
                <table
                  key={columnZones[0]}
                  className="rt-TableRootTable"
                  style={{
                    overflow: 'visible',
                    width: 'auto',
                    flex: 'none',
                    borderLeft: columnIndex > 0 ? '1px solid var(--gray-a5)' : undefined,
                  }}
                >
                  <Table.Header
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      backgroundColor: 'var(--color-panel-solid)',
                    }}
                  >
                    <Table.Row>
                      <Table.ColumnHeaderCell justify="center">District</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">
                        Polsby-
                        <br />
                        Popper
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center" style={lastCellPadding}>
                        Reock
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {columnZones.map(zone => (
                      <Table.Row
                        key={zone}
                        tabIndex={0}
                        {...hoverHandlers(() => onDistrictEnter([zone]), onDistrictLeave)}
                        onClick={() => zoomToDistrict(Number(zone))}
                        style={{cursor: 'pointer'}}
                      >
                        <Table.Cell justify="center" style={{verticalAlign: 'middle'}}>
                          <DistrictLabel zone={Number(zone)} />
                        </Table.Cell>
                        <Table.Cell justify="center" style={{verticalAlign: 'middle'}}>
                          <Text size="2">
                            {formatNumber(polsbyPopper[zone], NUMBER_FORMATS.DECIMAL_3)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell
                          justify="center"
                          style={{verticalAlign: 'middle', ...lastCellPadding}}
                        >
                          <Text size="2">
                            {formatNumber((reock ?? {})[zone], NUMBER_FORMATS.DECIMAL_3)}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </table>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
