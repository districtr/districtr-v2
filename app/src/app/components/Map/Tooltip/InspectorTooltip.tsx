'use client';
import {Table, Text} from '@radix-ui/themes';
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
import {useMapStore} from '@store/mapStore';

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
  const inspectorPov = useTooltipStore(state => state.inspectorPov);
  const childLayer = useMapStore(state => state.mapDocument?.child_layer);
  const isVoterHistory = inspectorMode === SUMMARY_TYPES.VOTERHISTORY;
  const standardFormat = isVoterHistory ? NUMBER_FORMATS.PERCENT : NUMBER_FORMATS.STANDARD;
  const ids = hoverFeatures.map(f => f.id as string);
  const blockCount = childLayer
    ? hoverFeatures.filter(f => f.sourceLayer === childLayer).length
    : 0;
  const wholeCount = ids.length - blockCount;
  const stableIds = useMemo(() => ids, [ids.join(',')]);
  const [inspectorData, setInspectorData] = useState<Record<string, number>>({});
  // _pct is the two-party dem share, so the rep share is its complement.
  const getValue = (column: string) => {
    if (!isVoterHistory) return inspectorData[column];
    const demShare = inspectorData[`${column}_pct`];
    return inspectorPov === 'rep' ? 1 - demShare : demShare;
  };
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
    const rowPct = isVoterHistory ? 1 : Math.max(0, inspectorData[`${column}_pct`] ?? 0);
    const widthPct = Math.min(rowPct, 1) * 100;
    const rowColor =
      isVoterHistory && !isNaN(inspectorData[`${column}_pct`])
        ? // _pct is the raw two-party dem share (0-1)
          withOpacity(PARTISAN_SCALE(inspectorData[`${column}_pct`]), 0.15)
        : 'rgba(17, 24, 39, 0.15)';

    return {
      backgroundImage: `linear-gradient(to right, ${rowColor} 0%, ${rowColor} ${widthPct}%, transparent ${widthPct}%, transparent 100%)`,
    };
  };

  useEffect(() => {
    if (stableIds.length > 0) {
      const _activeColumns = isVoterHistory
        ? [...activeColumns, ...activeColumns.map(colName => colName.replace('_dem', '_total'))]
        : activeColumns;
      const data = demographyService.calculateSummaryStats(stableIds, _activeColumns);
      if (data.length === 1) {
        setInspectorData(data[0]);
      }
    } else {
      setInspectorData({});
    }
  }, [activeColumns, inspectorMode, stableIds]);

  if (Object.keys(inspectorData).length === 0) return null;

  return (
    <>
      <Text as="p" size="1" color="gray" mb="1">
        {/* "whole" only means something next to a block count */}
        {formatNumber(wholeCount, NUMBER_FORMATS.STRING)} {childLayer ? 'whole ' : ''}
        {wholeCount === 1 ? 'unit' : 'units'}
        {childLayer &&
          ` · ${formatNumber(blockCount, NUMBER_FORMATS.STRING)} ${blockCount === 1 ? 'block' : 'blocks'}`}
      </Text>
      <Table.Root variant="surface" size="1" style={{margin: 0}} className="max-w-[50vw] w-64 ">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{title}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>
              {isVoterHistory ? (inspectorPov === 'rep' ? 'Rep share' : 'Dem share') : 'Value'}
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {totalColumn && (
            <Table.Row className="font-bold bg-gray-900/15">
              <Table.Cell>Total</Table.Cell>
              <Table.Cell>
                {formatNumber(inspectorData[totalColumn] ?? 0, standardFormat)}
              </Table.Cell>
            </Table.Row>
          )}
          {config
            .filter(f => activeColumns.includes(f.column))
            .map(f => (
              <Table.Row key={f.column} style={getRowBackground(f.column)}>
                <Table.Cell>{f.label}</Table.Cell>
                <Table.Cell>
                  {!isNaN(getValue(f.column))
                    ? formatNumber(getValue(f.column) ?? 0, standardFormat)
                    : 'No data'}
                </Table.Cell>
              </Table.Row>
            ))}
        </Table.Body>
      </Table.Root>
    </>
  );
};
