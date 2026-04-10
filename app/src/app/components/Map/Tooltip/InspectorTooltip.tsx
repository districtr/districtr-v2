'use client';
import {Table} from '@radix-ui/themes';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {demographyCache} from '@utils/demography/demographyCache';
import {useEffect, useState} from 'react';
import {CONFIG_BY_COLUMN_SET} from '@store/demography/evaluationConfig';
import {PARTISAN_SCALE} from '@store/demography/constants';
import {previousHoverFeatures as hoverFeatures} from '@/app/utils/map/hoverFeatures';
import {SUMMARY_TYPES, TOTAL_COLUMN} from '@constants/types';
import {INSPECTOR_TITLE} from '@constants/inspector';

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
  const usePercent = inspectorFormat === 'percent' || inspectorMode === SUMMARY_TYPES.VOTERHISTORY;
  const columnSuffix = usePercent ? '_pct' : '';
  const standardFormat =
    inspectorMode === SUMMARY_TYPES.VOTERHISTORY ? 'partisan' : usePercent ? 'percent' : 'standard';
  const ids = hoverFeatures.map(f => f.id as string);
  const [inspectorData, setInspectorData] = useState<Record<string, number>>({});
  const config = CONFIG_BY_COLUMN_SET[inspectorMode].sort((a, b) => a.label.localeCompare(b.label));
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
        ? withOpacity(PARTISAN_SCALE((inspectorData[`${column}_pct`] + 1) / 2), 0.15)
        : 'rgba(17, 24, 39, 0.15)';

    return {
      backgroundImage: `linear-gradient(to right, ${rowColor} 0%, ${rowColor} ${widthPct}%, transparent ${widthPct}%, transparent 100%)`,
    };
  };

  useEffect(() => {
    if (ids.length > 0) {
      const _activeColumns =
        inspectorMode === SUMMARY_TYPES.VOTERHISTORY
          ? [...activeColumns, ...activeColumns.map(colName => colName.replace('_lean', '_total'))]
          : activeColumns;
      const data = demographyCache.calculateSummaryStats(ids, _activeColumns);
      if (data.length === 1) {
        setInspectorData(data[0]);
      }
    } else {
      setInspectorData({});
    }
  }, [JSON.stringify(ids)]);

  if (Object.keys(inspectorData).length === 0) return null;

  return (
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
};
