'use client';
import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Table, Text} from '@radix-ui/themes';
import {DistrictLabel} from './DistrictLabel';
import {hoverHandlers} from './HoverTrigger';
import {useIsReport} from './evalMode';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {useZoomToDistrict} from '@/app/hooks/useZoomToDistrict';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';

const ROWS_PER_COLUMN = 10;
const MAX_COLUMNS = 3;
// Room kept free for the table's border and the scrollbar gutter.
const WIDTH_RESERVE = 20;
const SEPARATOR = '1px solid var(--gray-a5)';
// Report: districts per block of columns, so a block fits on a page and stays whole.
const REPORT_ROWS_PER_COLUMN = 20;

interface CompactnessScoreTableProps {
  polsbyPopper: Record<string, number>;
  reock?: Record<string, number>;
}

/**
 * Per-district compactness scores. Districts fill up to three side-by-side columns
 * of ROWS_PER_COLUMN rows, read down each column; beyond that the columns grow and
 * scroll together in a window ROWS_PER_COLUMN rows tall. A panel too narrow for the
 * columns gets as many as fit.
 *
 * The report has no scrolling: the districts run in blocks of three columns of
 * REPORT_ROWS_PER_COLUMN rows, one block under the other.
 */
export const CompactnessScoreTable: React.FC<CompactnessScoreTableProps> = ({
  polsbyPopper,
  reock,
}) => {
  const isReport = useIsReport();
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

  const renderColumns = (blockColumns: string[][]) => (
    <div className="flex">
      {blockColumns.map((columnZones, columnIndex) => {
        const isLastColumn = columnIndex === blockColumns.length - 1;
        const lastCellPadding = isLastColumn
          ? {paddingRight: 'calc(var(--table-cell-padding) + 8px)'}
          : undefined;
        return (
          // The wrapper stretches to the tallest column, so the line between two
          // columns runs the full height; a shorter column closes with a bottom line.
          <div
            key={columnZones[0]}
            style={{flex: 'none', borderLeft: columnIndex > 0 ? SEPARATOR : undefined}}
          >
            <table
              className="rt-TableRootTable"
              style={{
                overflow: 'visible',
                width: 'auto',
                borderBottom: columnZones.length < blockColumns[0].length ? SEPARATOR : undefined,
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
                    tabIndex={isReport ? undefined : 0}
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
          </div>
        );
      })}
    </div>
  );

  if (isReport) {
    const blocks: string[][][] = [];
    const perBlock = MAX_COLUMNS * REPORT_ROWS_PER_COLUMN;
    for (let start = 0; start < zones.length; start += perBlock) {
      const blockZones = zones.slice(start, start + perBlock);
      const count = Math.min(MAX_COLUMNS, Math.ceil(blockZones.length / ROWS_PER_COLUMN));
      const rows = Math.ceil(blockZones.length / count);
      blocks.push(
        Array.from({length: count}, (_, i) => blockZones.slice(i * rows, (i + 1) * rows))
      );
    }
    return (
      <>
        {blocks.map(blockColumns => (
          <div
            key={blockColumns[0][0]}
            className="rt-TableRoot rt-r-size-1 rt-variant-surface"
            style={{width: 'fit-content', marginBottom: 'var(--space-3)'}}
          >
            {renderColumns(blockColumns)}
          </div>
        ))}
      </>
    );
  }

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
          {renderColumns(columns)}
        </div>
      </div>
    </div>
  );
};
