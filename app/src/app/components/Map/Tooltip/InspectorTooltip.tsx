'use client';
import {Table} from '@radix-ui/themes';
import {formatNumber} from '@utils/numbers';
import {useTooltipStore} from '@store/tooltipStore';
import {useHoverStore} from '@store/hoverFeatures';
import {demographyCache} from '@utils/demography/demographyCache';
import {useEffect, useState} from 'react';
import {CONFIG_BY_COLUMN_SET} from '@store/demography/evaluationConfig';
import {PARTISAN_SCALE} from '@store/demography/constants';
import {INSPECTOR_TITLE, TOTAL_COLUMN} from '@components/Map/Tooltip/InpsectorTooltipConfig';

export const InspectorTooltip = () => {
  const hoverFeatures = useHoverStore(state => state.hoverFeatures);
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const inspectorFormat = useTooltipStore(state => state.inspectorFormat);
  const usePercent = inspectorFormat === 'percent' || inspectorMode === 'VOTERHISTORY';
  const columnSuffix = usePercent ? '_pct' : '';
  const standardFormat =
    inspectorMode === 'VOTERHISTORY' ? 'partisan' : usePercent ? 'percent' : 'standard';
  const ids = hoverFeatures.map(f => f.id as string);
  const [inspectorData, setInspectorData] = useState<Record<string, number>>({});
  const config = CONFIG_BY_COLUMN_SET[inspectorMode].sort((a, b) => a.label.localeCompare(b.label));
  const title = INSPECTOR_TITLE[inspectorMode];
  const totalColumn = TOTAL_COLUMN[inspectorMode];
  const totalValue = totalColumn && inspectorData[totalColumn];
  const showBars = Boolean(!totalColumn || (totalColumn && totalValue));

  useEffect(() => {
    if (ids.length > 0) {
      const _activeColumns =
        inspectorMode === 'VOTERHISTORY'
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
            <Table.Cell>{formatNumber(inspectorData[totalColumn], standardFormat)}</Table.Cell>
          </Table.Row>
        )}
        {config 
            .filter(f => activeColumns.includes(f.column))
            .map(f => (
              <Table.Row key={f.column} className="relative">
                <Table.Cell>{f.label}</Table.Cell>
                <Table.Cell>
                  {formatNumber(inspectorData[f.column + columnSuffix], standardFormat)}
                </Table.Cell>
                {showBars && <span
                  className="bg-gray-900 absolute h-full top-0 left-0"
                  style={{
                    width:
                      inspectorMode === 'VOTERHISTORY'
                        ? '100%'
                        : `${inspectorData[f.column + '_pct'] * 100}%`,
                    opacity: '.15',
                    backgroundColor:
                      inspectorMode === 'VOTERHISTORY' && !isNaN(inspectorData[f.column + '_pct'])
                        ? PARTISAN_SCALE((inspectorData[f.column + '_pct'] + 1) / 2)
                        : undefined,
                  }}
                />}
              </Table.Row>
            ))}
      </Table.Body>
    </Table.Root>
  );
};
