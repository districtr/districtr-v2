import React, {useEffect, useState} from 'react';
import {
  Blockquote,
  Box,
  Button,
  CheckboxGroup,
  Heading,
  IconButton,
  Popover,
  Select,
  Spinner,
  Table,
  Tooltip,
} from '@radix-ui/themes';
import {Flex, Text} from '@radix-ui/themes';
import {formatNumber, NumberFormats} from '@/app/utils/numbers';
import {interpolateGreys} from 'd3-scale-chromatic';
import {SummaryRecord, SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {
  EvalModes,
  modeButtonConfig,
  numberFormats,
  summaryStatLabels,
} from '@/app/store/demography/evaluationConfig';
import {PARTISAN_SCALE} from '@/app/store/demography/constants';
import {GearIcon, InfoCircledIcon} from '@radix-ui/react-icons';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {CoalitionGroupKey, COALITION_VARIABLE_BY_UNIVERSE} from '@/app/utils/demography/coalition';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {compareCoiZonesByRenderOrder, getCommunityDisplayNumber} from '@/app/utils/communities';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useMapStore} from '@/app/store/mapStore';

type ColumnConfig = {
  label: string;
  column: string;
  sourceCol?: string;
  tooltip?: string;
};

type EvaluationProps = {
  summaryType: keyof SummaryStatConfig;
  setSummaryType: (summaryType: keyof SummaryStatConfig) => void;
  displayedColumnSets?: Array<keyof SummaryStatConfig>;
  columnConfigs: ColumnConfig[];
  title?: string;
  singleZone?: number;
  universeTotals?: SummaryRecord | null;
};

type EvaluationDataRow = SummaryRecord | Record<string, string | number | boolean>;

type EvaluationTableHeaderProps = {
  columnConfigs: ColumnConfig[];
};

type EvaluationTableBodyProps = {
  rows: EvaluationDataRow[];
  colorScheme: string[];
  columnConfigs: ColumnConfig[];
  evalMode: EvalModes;
  colorBg: boolean;
  summaryType: keyof SummaryStatConfig;
  numberFormat: NumberFormats;
  maxValues: Record<string, number>;
  mapMode: string;
  communities: ReturnType<typeof useMapStore.getState>['communities'];
  getZoneColor: (zone: number | null, fallback?: string) => string;
};

type EvaluationTableRowProps = Omit<EvaluationTableBodyProps, 'rows'> & {
  row: EvaluationDataRow;
};

type EvaluationTableCellProps = Omit<EvaluationTableRowProps, 'columnConfigs' | 'colorScheme' | 'mapMode' | 'communities' | 'getZoneColor'> & {
  columnConfig: ColumnConfig;
  isUniverse: boolean;
  isUnassigned: boolean;
};

function buildUniverseRow({
  summaryData,
  universeTotalColumn,
  columnConfigs,
  summaryType,
  coalitionGroups,
}: {
  summaryData: Record<string, number>;
  universeTotalColumn: string;
  columnConfigs: ColumnConfig[];
  summaryType: 'TOTPOP' | 'VAP';
  coalitionGroups: CoalitionGroupKey[];
}): Record<string, number | string | boolean> {
  const coalitionStats = demographyCache.getCoalitionUniverseStats(summaryType, coalitionGroups);
  const row: Record<string, number | string | boolean> = {
    zone: 'Universe',
    __isUniverse: true,
  };
  const universeTotal = summaryData[universeTotalColumn];
  columnConfigs.forEach(config => {
    if (config.column === COALITION_VARIABLE_BY_UNIVERSE[summaryType]) {
      row[config.column] = coalitionStats.coalitionTotal;
      row[`${config.column}_pct`] = coalitionStats.coalitionPct;
      return;
    }
    const value = summaryData[config.column];
    row[config.column] = value;
    row[`${config.column}_pct`] =
      Number.isFinite(universeTotal) && universeTotal > 0 && Number.isFinite(value)
        ? value / universeTotal
        : NaN;
  });
  return row;
}

const Evaluation: React.FC<EvaluationProps> = ({
  summaryType,
  setSummaryType,
  displayedColumnSets,
  columnConfigs,
  title,
  singleZone,
  universeTotals,
}) => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const {zoneStats, demoIsLoaded, zoneData, summaryStats} = useSummaryStats(showUnassigned);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);

  const maxValues = zoneStats?.maxValues;
  const colorScheme = useColorScheme();
  const getZoneColor = useZoneColorGetter();
  const mapMode = useMapControlsStore(state => state.mapMode);
  const communities = useMapStore(state => state.communities);
  const summaryStatConfig = summaryStatLabels.find(f => f.value === summaryType);
  const displayedStatLabels = summaryStatLabels.filter(f =>
    displayedColumnSets ? displayedColumnSets.includes(f.value) : true
  );
  const showSummaryTypeSelect = displayedStatLabels.length > 1;
  const showModeButtons = Boolean(
    summaryStatConfig?.supportedModes?.length && summaryStatConfig?.supportedModes?.length > 1
  );
  const numberFormat = numberFormats[summaryType === 'VOTERHISTORY' ? 'partisan' : evalMode];

  useEffect(() => {
    if (
      summaryStatConfig?.supportedModes?.length &&
      summaryStatConfig?.supportedModes?.length === 1
    ) {
      setEvalMode(summaryStatConfig?.supportedModes[0]);
    }
  }, [summaryStatConfig]);

  if (!demoIsLoaded) {
    return (
      <Flex dir="column" justify="center" align="center" p="4">
        <Spinner />
        <Text size="2" className="ml-2">
          Loading evaluation data...
        </Text>
      </Flex>
    );
  }
  if (!zoneData || !maxValues) {
    return (
      <Blockquote color="crimson">
        <Text>Summary statistics are not available for this map.</Text>
      </Blockquote>
    );
  }

  const universeTotalColumn =
    summaryType === 'TOTPOP' ? 'total_pop_20' : summaryType === 'VAP' ? 'total_vap_20' : undefined;
  const summaryData =
    summaryType === 'TOTPOP' || summaryType === 'VAP'
      ? (summaryStats[summaryType] as Record<string, number> | undefined)
      : undefined;
  const universeRow =
    universeTotalColumn && summaryData && (summaryType === 'TOTPOP' || summaryType === 'VAP')
      ? buildUniverseRow({
          summaryData,
          universeTotalColumn,
          columnConfigs,
          summaryType,
          coalitionGroups,
        })
      : undefined;

  const baseRows: EvaluationDataRow[] = (() => {
    if (singleZone != null) {
      const filtered = zoneData.filter(r => r.zone === singleZone);
      const effectiveUniverseTotals = universeTotals ?? demographyCache.universeTotals;
      return effectiveUniverseTotals ? [...filtered, effectiveUniverseTotals] : filtered;
    }
    return [...zoneData, ...(universeRow ? [universeRow] : [])];
  })();

  const rows = baseRows.sort((a, b) => {
    const aIsUniverse = Boolean((a as Record<string, unknown>).__isUniverse) || a.zone === 0;
    const bIsUniverse = Boolean((b as Record<string, unknown>).__isUniverse) || b.zone === 0;
    if (aIsUniverse) return 1;
    if (bIsUniverse) return -1;
    if (a.zone === undefined) return 1;
    if (b.zone === undefined) return -1;
    if (mapMode === 'coi') {
      return compareCoiZonesByRenderOrder(a.zone as number, b.zone as number, communities);
    }
    return ((a.zone as number) || 0) - ((b.zone as number) || 0);
  });

  return (
    <Box width={'100%'}>
      <Flex direction="row" gap="3" align="center" pb="2">
        <Flex direction="column" gap="1" flexGrow="1">
          {title && (
            <Heading as="h3" size="3">
              {title}
            </Heading>
          )}
          {showSummaryTypeSelect && (
            <Flex direction="row" gap="2" align="center">
              <Text size="2">Summary type</Text>
              <Select.Root
                value={summaryType}
                onValueChange={value => setSummaryType(value as keyof SummaryStatConfig)}
              >
                <Select.Trigger />
                <Select.Content>
                  {displayedStatLabels.map(({value, label}) => (
                    <Select.Item key={value} value={value}>
                      {label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          )}
        </Flex>
        <Popover.Root>
          <Popover.Trigger>
            <IconButton variant="ghost" size="3" aria-label="Open evaluation options">
              <GearIcon />
            </IconButton>
          </Popover.Trigger>
          <Popover.Content>
            <Heading as="h4" size="3">
              Summary Options
            </Heading>
            {showModeButtons && (
              <Flex align="center" gap="3" my="2" wrap="wrap">
                {modeButtonConfig.map((mode, i) => (
                  <Button
                    key={i}
                    variant={mode.value === evalMode ? 'solid' : 'outline'}
                    onClick={() => setEvalMode(mode.value)}
                  >
                    {mode.label}
                  </Button>
                ))}
              </Flex>
            )}
            <Flex align="center" gap="3" mt="1">
              <CheckboxGroup.Root
                defaultValue={[]}
                orientation="horizontal"
                name="evaluation-options"
                value={[colorBg ? 'colorBg' : '', showUnassigned ? 'unassigned' : '']}
              >
                <CheckboxGroup.Item value="unassigned" onClick={() => setShowUnassigned(v => !v)}>
                  Show Unassigned Population
                </CheckboxGroup.Item>
                <CheckboxGroup.Item value="colorBg" onClick={() => setColorBg(v => !v)}>
                  <Flex gap="3">
                    <p>Color Cells By Values</p>
                  </Flex>
                </CheckboxGroup.Item>
              </CheckboxGroup.Root>
            </Flex>
          </Popover.Content>
        </Popover.Root>
      </Flex>
      <Box overflowX="auto" className="text-sm">
        <Table.Root className="min-w-full border-collapse">
          <EvaluationTableHeader columnConfigs={columnConfigs} />
          <EvaluationTableBody
            rows={rows}
            colorScheme={colorScheme}
            columnConfigs={columnConfigs}
            evalMode={evalMode}
            colorBg={colorBg}
            summaryType={summaryType}
            numberFormat={numberFormat}
            maxValues={maxValues}
            mapMode={mapMode}
            communities={communities}
            getZoneColor={getZoneColor}
          />
        </Table.Root>
      </Box>
    </Box>
  );
};
const EvaluationTableHeader: React.FC<EvaluationTableHeaderProps> = ({columnConfigs}) => {
  return (
    <Table.Header>
      <Table.Row className="bg-gray-50 border-b">
        <Table.ColumnHeaderCell className="py-2 px-4 text-left font-semibold">
          Zone
        </Table.ColumnHeaderCell>
        {!!columnConfigs &&
          columnConfigs.map((f, i) => (
            <Table.ColumnHeaderCell className="py-2 px-4 text-right font-semibold" key={i}>
              <Flex justify="end" align="center" gap="1">
                <span>{f.label}</span>
                {f.tooltip && (
                  <Tooltip content={f.tooltip}>
                    <span className="inline-flex text-gray-600">
                      <InfoCircledIcon />
                    </span>
                  </Tooltip>
                )}
              </Flex>
            </Table.ColumnHeaderCell>
          ))}
      </Table.Row>
    </Table.Header>
  );
};

const EvaluationTableBody: React.FC<EvaluationTableBodyProps> = ({rows, ...props}) => {
  return (
    <Table.Body>
      {rows.map((row, i) => (
        <EvaluationTableRow key={i} {...props} row={row} />
      ))}
    </Table.Body>
  );
};

const EvaluationTableRow: React.FC<EvaluationTableRowProps> = ({
  row,
  colorScheme,
  columnConfigs,
  evalMode,
  colorBg,
  summaryType,
  numberFormat,
  maxValues,
  mapMode,
  communities,
  getZoneColor,
}) => {
  const isUniverse = Boolean((row as Record<string, unknown>).__isUniverse) || row.zone === 0;
  const isUnassigned = !isUniverse && row.zone === undefined;
  const zoneName = isUniverse
    ? 'Overall'
    : isUnassigned
      ? 'None'
      : mapMode === 'coi'
        ? getCommunityDisplayNumber(communities, row.zone as number)
        : row.zone;
  const backgroundColor = isUniverse
    ? '#111111'
    : isUnassigned
      ? '#DDDDDD'
      : getZoneColor(row.zone as number, colorScheme[(row.zone as number) - 1] ?? '#000000');

  return (
    <Table.Row className={`border-b ${isUniverse ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
      <Table.Cell
        className={`py-2 px-4 font-medium flex flex-row items-center gap-1 ${isUniverse ? 'font-semibold' : ''}`}
      >
        <span className={'size-4 inline-block rounded-md'} style={{backgroundColor}}></span>
        {zoneName}
      </Table.Cell>
      {!!columnConfigs &&
        columnConfigs.map((columnConfig, i) => (
          <EvaluationTableCell
            key={i}
            row={row}
            evalMode={evalMode}
            columnConfig={columnConfig}
            isUniverse={isUniverse}
            isUnassigned={isUnassigned}
            colorBg={colorBg}
            summaryType={summaryType}
            numberFormat={numberFormat}
            maxValues={maxValues}
          />
        ))}
    </Table.Row>
  );
};

const EvaluationTableCell: React.FC<EvaluationTableCellProps> = ({
  row,
  evalMode,
  columnConfig,
  isUniverse,
  isUnassigned,
  colorBg,
  summaryType,
  numberFormat,
  maxValues,
}) => {
  const column = evalMode === 'count' ? columnConfig.column : `${columnConfig.column}_pct`;
  const value = (row as Record<string, number | undefined>)[column];
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  let colorValue: number | undefined;
  if (numericValue !== undefined) {
    colorValue =
      evalMode === 'count' && maxValues[column] !== 0
        ? numericValue / maxValues[column]
        : numericValue;
  }
  const hasValidColorValue =
    colorValue !== undefined && typeof colorValue === 'number' && Number.isFinite(colorValue);
  let backgroundColor: string | undefined;
  if (!hasValidColorValue || isUniverse) {
  } else if (colorBg && summaryType === 'VOTERHISTORY') {
    backgroundColor = PARTISAN_SCALE((numericValue! + 1) / 2);
  } else if (colorBg && !isUnassigned) {
    backgroundColor = interpolateGreys(colorValue as number)
      .replace('rgb', 'rgba')
      .replace(')', ',0.5)');
  } else {
    backgroundColor = 'initial';
  }

  return (
    <Table.Cell
      className={`py-2 px-4 text-right ${isUniverse ? 'font-semibold' : ''}`}
      style={{
        backgroundColor,
      }}
    >
      {numericValue === undefined ? '--' : formatNumber(numericValue, numberFormat)}
    </Table.Cell>
  );
};
export default Evaluation;
