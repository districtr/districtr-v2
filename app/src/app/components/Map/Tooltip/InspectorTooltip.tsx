'use client';
import {Flex, Table, Text} from '@radix-ui/themes';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {useEffect, useMemo, useState} from 'react';
import {CONFIG_BY_COLUMN_SET} from '@store/demography/demographyTableConfig';
import {PARTISAN_SCALE} from '@store/demography/constants';
import {previousHoverFeatures as hoverFeatures} from '@/app/utils/map/hoverFeatures';
import {SUMMARY_TYPES, TOTAL_COLUMN} from '@constants/demography/summary';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {INSPECTOR_TITLE} from '@constants/demography/inspectorLabels';
import {overlayIdOf} from '@constants/map/paintBy';
import {useMapControlsStore} from '@store/mapControlsStore';

const withOpacity = (color: string, opacity: number) => {
  if (color.startsWith('rgba(')) return color;
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split('')
            .map(char => char + char)
            .join('')
        : hex;
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
  return color;
};

export const InspectorTooltip = () => {
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const inspectorFormat = useTooltipStore(state => state.inspectorFormat);
  const usePercent =
    inspectorFormat === NUMBER_FORMATS.PERCENT || inspectorMode === SUMMARY_TYPES.VOTERHISTORY;
  const columnSuffix = usePercent ? '_pct' : '';
  const standardFormat = usePercent ? NUMBER_FORMATS.PERCENT : NUMBER_FORMATS.STANDARD;
  // Inspect by overlay area reads the area's rows (inspectOverlayArea), not the hover.
  const byArea = useMapControlsStore(state => !!overlayIdOf(state.mapOptions.paintBy));
  const areaReading = useTooltipStore(state => state.areaReading);
  const ids = byArea ? [] : hoverFeatures.map(f => f.id as string);
  const stableIds = useMemo(() => ids, [ids.join(',')]);
  const [inspectorData, setInspectorData] = useState<Record<string, number>>({});
  // Total is pinned above; order by universe totals, voter history stays chronological.
  const universeTotals = demographyService.universeTotals;
  const config = CONFIG_BY_COLUMN_SET[inspectorMode].filter(f => !f.isTotal);
  if (inspectorMode !== SUMMARY_TYPES.VOTERHISTORY) {
    config.sort((a, b) => (universeTotals?.[b.column] ?? 0) - (universeTotals?.[a.column] ?? 0));
  }
  const title = INSPECTOR_TITLE[inspectorMode];
  const totalColumn = TOTAL_COLUMN[inspectorMode];
  const totalValue = totalColumn && inspectorData[totalColumn];
  const showBars = Boolean(!totalColumn || (totalColumn && totalValue));
  const getRowBackground = (column: string) => {
    if (!showBars) return undefined;
    const rowPct =
      inspectorMode === SUMMARY_TYPES.VOTERHISTORY
        ? 1
        : Math.max(0, inspectorData[`${column}_pct`] ?? 0);
    const widthPct = Math.min(rowPct, 1) * 100;
    const rowColor =
      inspectorMode === SUMMARY_TYPES.VOTERHISTORY && !isNaN(inspectorData[`${column}_pct`])
        ? // _pct is the raw two-party dem share (0-1)
          withOpacity(PARTISAN_SCALE(inspectorData[`${column}_pct`]), 0.15)
        : 'rgba(17, 24, 39, 0.15)';

    return {
      backgroundImage: `linear-gradient(to right, ${rowColor} 0%, ${rowColor} ${widthPct}%, transparent ${widthPct}%, transparent 100%)`,
    };
  };

  useEffect(() => {
    const rowIds = byArea ? (areaReading?.ids ?? []) : stableIds;
    const extraRows = byArea ? areaReading?.extraRows : undefined;
    if (rowIds.length > 0 || extraRows?.path.length) {
      const _activeColumns =
        inspectorMode === SUMMARY_TYPES.VOTERHISTORY
          ? [...activeColumns, ...activeColumns.map(colName => colName.replace('_dem', '_total'))]
          : activeColumns;
      const data = demographyService.calculateSummaryStats(rowIds, _activeColumns, extraRows);
      if (data.length === 1) {
        setInspectorData(data[0]);
      }
    } else {
      setInspectorData({});
    }
  }, [activeColumns, inspectorMode, stableIds, byArea, areaReading]);

  const areaNote =
    byArea && areaReading
      ? areaReading.loading
        ? areaReading.exact
          ? 'Reading blocks for exact numbers…'
          : 'Reading this area…'
        : areaReading.exact
          ? 'Exact: blocks whose center is inside.'
          : 'Approximate. Click the area for exact numbers.'
      : null;
  if (Object.keys(inspectorData).length === 0) {
    return areaNote ? <Text size="1">{areaNote}</Text> : null;
  }

  const table = (
    <Table.Root variant="surface" size="1" style={{margin: 0}} className="max-w-[50vw] w-64 ">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>{title}</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {totalColumn && (
          <Table.Row className="font-bold bg-gray-900/15">
            <Table.Cell>Total</Table.Cell>
            <Table.Cell>{formatNumber(inspectorData[totalColumn] ?? 0, standardFormat)}</Table.Cell>
          </Table.Row>
        )}
        {config
          .filter(f => activeColumns.includes(f.column))
          .map(f => (
            <Table.Row key={f.column} style={getRowBackground(f.column)}>
              <Table.Cell>{f.label}</Table.Cell>
              <Table.Cell>
                {!isNaN(inspectorData[f.column + columnSuffix])
                  ? formatNumber(inspectorData[f.column + columnSuffix] ?? 0, standardFormat)
                  : 'No data'}
              </Table.Cell>
            </Table.Row>
          ))}
      </Table.Body>
    </Table.Root>
  );
  return areaNote ? (
    <Flex direction="column" gap="1" className="max-w-[50vw] w-64">
      {table}
      <Text size="1" color="gray">
        {areaNote}
      </Text>
    </Flex>
  ) : (
    table
  );
};
