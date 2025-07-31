'use client';
import {Box, Flex, Popover, Table, Text} from '@radix-ui/themes';
import {useMapStore} from '../store/mapStore';
import {formatNumber, NumberFormats} from '../utils/numbers';
import {useTooltipStore} from '../store/tooltipStore';
import {useHoverStore} from '../store/hoverFeatures';
import {demographyCache} from '../utils/demography/demographyCache';
import {useEffect, useState} from 'react';
import {
  CONFIG_BY_COLUMN_SET,
  TOTPOPColumnConfig,
  VAPColumnConfig,
} from '../store/demography/evaluationConfig';
import {KeyOfSummaryStatConfig} from '../utils/api/summaryStats';
import {PARTISAN_SCALE} from '../store/demography/constants';

export const MapTooltip = () => {
  const tooltip = useTooltipStore(state => state.tooltip);
  const activeTool = useMapStore(state => state.activeTool);
  if (!tooltip) return null;

  return (
    <Popover.Root open={true}>
      <Popover.Content
        style={{
          position: 'fixed',
          left: tooltip.x + 10,
          top: tooltip.y + 10,
          pointerEvents: 'none',
        }}
      >
        <Box flexGrow="1">
          {tooltip.data.map((entry, i) => (
            <Text key={`tooltip-${i}`} style={{whiteSpace: 'nowrap'}}>
              {/* @ts-ignore */}
              {entry.label}:{' '}
              {!isNaN(+(entry.value as number))
                ? formatNumber(entry.value as number, 'string')
                : entry.value}
            </Text>
          ))}
          {activeTool === 'inspector' && <InspectorTooltipEntries />}
        </Box>
      </Popover.Content>
    </Popover.Root>
  );
};

const INSPECTOR_TITLE = {
  VAP: 'Voting Age Population',
  TOTPOP: 'Total Population',
  VOTERHISTORY: 'Voter History',
};

export const InspectorTooltipEntries = () => {
  const hoverFeatures = useHoverStore(state => state.hoverFeatures);
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const inspectorFormat = useTooltipStore(state => state.inspectorFormat);
  const usePercent = inspectorFormat === 'percent' || inspectorMode === 'VOTERHISTORY';
  const columnSuffix = usePercent ? '_pct' : '';
  const standardFormat = usePercent ? 'percent' : 'standard';
  const ids = hoverFeatures.map(f => f.id as string);
  const [inspectorData, setInspectorData] = useState<Record<string, number>>({});
  const config = CONFIG_BY_COLUMN_SET[inspectorMode].sort((a, b) => a.label.localeCompare(b.label));
  const title = INSPECTOR_TITLE[inspectorMode];

  const totalColumn = {
    VAP: 'total_vap_20',
    TOTPOP: 'total_pop_20',
    VOTERHISTORY: undefined,
  }[inspectorMode];
  const format: Record<KeyOfSummaryStatConfig, NumberFormats> = {
    VAP: standardFormat,
    TOTPOP: standardFormat,
    VOTERHISTORY: 'partisan',
  };

  useEffect(() => {
    const _activeColumns =
      inspectorMode === 'VOTERHISTORY'
        ? [...activeColumns, ...activeColumns.map(colName => colName.replace('_lean', '_total'))]
        : activeColumns;
    const data = demographyCache.calculateSummaryStats(ids, _activeColumns);
    if (data.length === 1) {
      setInspectorData(data[0]);
    }
  }, [JSON.stringify(ids)]);
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
          <Table.Row>
            <Table.RowHeaderCell>{title}</Table.RowHeaderCell>
            <Table.Cell>
              {formatNumber(inspectorData[totalColumn], format[inspectorMode])}
            </Table.Cell>
          </Table.Row>
        )}
        {config
          .filter(f => activeColumns.includes(f.column))
          .map(f => (
            <Table.Row key={f.column} className="relative">
              <Table.RowHeaderCell>{f.label}</Table.RowHeaderCell>
              <Table.Cell>
                {formatNumber(inspectorData[f.column + columnSuffix], format[inspectorMode])}
              </Table.Cell>
              <span
                className="bg-gray-900 absolute h-full top-0 left-0"
                style={{
                  width:
                    inspectorMode === 'VOTERHISTORY'
                      ? '100%'
                      : `${inspectorData[f.column + '_pct'] * 100}%`,
                  opacity: '.25',
                  backgroundColor:
                    inspectorMode === 'VOTERHISTORY'
                      ? PARTISAN_SCALE(((inspectorData[f.column + '_pct'] as number) + 1) / 2)
                      : undefined,
                }}
              />
            </Table.Row>
          ))}
      </Table.Body>
    </Table.Root>
  );
};
