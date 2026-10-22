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
import {GEO_UNIT_LABELS, type GeoUnit} from '@constants/document/geoUnits';

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

const NEUTRAL_BAR = 'rgba(17, 24, 39, 0.15)';
const POV_HEADER = {dem: 'Dem share', rep: 'Rep share'} as const;

// GEO_UNIT_LABELS are all plain plurals ("VTDs", "block groups", "blocks").
const unitCountLabel = (type: GeoUnit, count: number) => {
  const label = GEO_UNIT_LABELS[type];
  return `${formatNumber(count, NUMBER_FORMATS.STRING)} ${count === 1 ? label.slice(0, -1) : label}`;
};

export const InspectorTooltip = () => {
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const inspectorPov = useTooltipStore(state => state.inspectorPov);
  const mapDocument = useMapStore(state => state.mapDocument);
  const isVoterHistory = inspectorMode === SUMMARY_TYPES.VOTERHISTORY;
  const valueFormat = isVoterHistory ? NUMBER_FORMATS.PERCENT : NUMBER_FORMATS.STANDARD;
  const ids = hoverFeatures.map(f => f.id as string);
  const stableIds = useMemo(() => ids, [ids.join(',')]);
  const [inspectorData, setInspectorData] = useState<Record<string, number>>({});

  // Child-layer features are broken-out units; everything else is a whole parent unit.
  const childCount = mapDocument?.child_layer
    ? hoverFeatures.filter(f => f.sourceLayer === mapDocument.child_layer).length
    : 0;
  const unitCounts = [
    {type: mapDocument?.parent_geo_unit_type, count: ids.length - childCount},
    {type: mapDocument?.child_geo_unit_type, count: childCount},
  ].flatMap(({type, count}) => (type ? [unitCountLabel(type, count)] : []));

  // Total is pinned above; order by universe totals, voter history stays chronological.
  const universeTotals = demographyService.universeTotals;
  const rows = CONFIG_BY_COLUMN_SET[inspectorMode].filter(
    f => !f.isTotal && activeColumns.includes(f.column)
  );
  if (!isVoterHistory) {
    rows.sort((a, b) => (universeTotals?.[b.column] ?? 0) - (universeTotals?.[a.column] ?? 0));
  }
  const totalColumn = TOTAL_COLUMN[inspectorMode];
  const showBars = !totalColumn || Boolean(inspectorData[totalColumn]);

  // _pct is the two-party dem share for voter history, so the rep share is its complement.
  const formatValue = (column: string) => {
    const demShare = inspectorData[`${column}_pct`];
    const value = !isVoterHistory
      ? inspectorData[column]
      : inspectorPov === 'rep'
        ? 1 - demShare
        : demShare;
    return isNaN(value) ? 'No data' : formatNumber(value, valueFormat);
  };

  // Voter history rows are full width, tinted by the dem share; other rows are
  // gray bars as wide as their share of the total.
  const getRowBackground = (column: string) => {
    if (!showBars) return undefined;
    const pct = inspectorData[`${column}_pct`];
    const [color, width] = isVoterHistory
      ? [isNaN(pct) ? NEUTRAL_BAR : withOpacity(PARTISAN_SCALE(pct), 0.15), 100]
      : [NEUTRAL_BAR, Math.min(Math.max(0, pct ?? 0), 1) * 100];
    return {
      backgroundImage: `linear-gradient(to right, ${color} 0%, ${color} ${width}%, transparent ${width}%, transparent 100%)`,
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
        {unitCounts.join(' · ')}
      </Text>
      <Table.Root variant="surface" size="1" style={{margin: 0}} className="max-w-[50vw] w-64 ">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{INSPECTOR_TITLE[inspectorMode]}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>
              {isVoterHistory ? POV_HEADER[inspectorPov] : 'Value'}
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {totalColumn && (
            <Table.Row className="font-bold bg-gray-900/15">
              <Table.Cell>Total</Table.Cell>
              <Table.Cell>{formatValue(totalColumn)}</Table.Cell>
            </Table.Row>
          )}
          {rows.map(f => (
            <Table.Row key={f.column} style={getRowBackground(f.column)}>
              <Table.Cell>{f.label}</Table.Cell>
              <Table.Cell>{formatValue(f.column)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </>
  );
};
