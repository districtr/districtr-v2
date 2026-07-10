import React, {useEffect, useState} from 'react';
import {
  Blockquote,
  Box,
  CheckboxGroup,
  Heading,
  IconButton,
  Popover,
  SegmentedControl,
  Spinner,
  Table,
  Tooltip,
} from '@radix-ui/themes';
import {Flex, Text} from '@radix-ui/themes';
import {formatNumber} from '@/app/utils/numbers';
import {interpolateGreys} from 'd3-scale-chromatic';
import {PARTISAN_SCALE} from '@/app/store/demography/constants';
import {SummaryRecord} from '@/app/utils/api/summaryStats';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {
  modeButtonConfig,
  numberFormats,
  summaryStatLabels,
} from '@/app/store/demography/evaluationConfig';
import {GearIcon, InfoCircledIcon} from '@radix-ui/react-icons';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {demographyService} from '@/app/utils/demography/demographyService';
import {
  type CoalitionGroupKey,
  COALITION_VARIABLE_BY_UNIVERSE,
} from '@constants/demography/coalition';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {compareCoiZonesByRenderOrder, getCommunityDisplayNumber} from '@/app/utils/communities';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {useMapStore} from '@/app/store/mapStore';
import {
  SUMMARY_TYPES,
  type SummaryType,
  type CoalitionUniverse,
  isCoalitionUniverse,
  TOTAL_COLUMN,
} from '@constants/demography/summary';
import {type NumberFormat} from '@constants/demography/format';
import {EVAL_MODES, type EvalMode} from '@constants/demography/evalMode';
import {MAP_MODES} from '@constants/map/mode';

type ColumnConfig = {
  label: string;
  column: string;
  sourceCol?: string;
  tooltip?: string;
};

type EvaluationProps = {
  summaryType: SummaryType;
  setSummaryType: (summaryType: SummaryType) => void;
  displayedColumnSets?: Array<SummaryType>;
  columnConfigs: ColumnConfig[];
  title?: string;
  singleZone?: number;
  universeTotals?: SummaryRecord | null;
};

type EvaluationDataRow = SummaryRecord | Record<string, string | number | boolean>;

type EvaluationTableHeaderProps = {
  columnConfigs: ColumnConfig[];
  zoneHeader?: string;
};

type PartisanPov = 'dem' | 'rep';

type EvaluationTableBodyProps = {
  rows: EvaluationDataRow[];
  colorScheme: string[];
  columnConfigs: ColumnConfig[];
  evalMode: EvalMode;
  colorBg: boolean;
  summaryType: SummaryType;
  numberFormat: NumberFormat;
  maxValues: Record<string, number>;
  mapMode: string;
  communities: ReturnType<typeof useMapStore.getState>['communities'];
  getZoneColor: (zone: number | null, fallback?: string) => string;
  pov: PartisanPov;
};

type EvaluationTableRowProps = Omit<EvaluationTableBodyProps, 'rows'> & {
  row: EvaluationDataRow;
};

type EvaluationTableCellProps = Omit<
  EvaluationTableRowProps,
  'columnConfigs' | 'colorScheme' | 'mapMode' | 'communities' | 'getZoneColor'
> & {
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
  summaryType: CoalitionUniverse;
  coalitionGroups: CoalitionGroupKey[];
}): Record<string, number | string | boolean> {
  const coalitionStats = demographyService.getCoalitionUniverseStats(summaryType, coalitionGroups);
  const row: Record<string, number | string | boolean> = {
    zone: 'Statewide',
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
  const [evalMode, setEvalMode] = useState<EvalMode>(EVAL_MODES.SHARE);
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const [pov, setPov] = useState<PartisanPov>('dem');
  const {zoneStats, demoIsLoaded, zoneData, summaryStats} = useSummaryStats(showUnassigned);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);

  const maxValues = zoneStats?.maxValues;
  const effectiveUniverseTotals =
    singleZone != null ? (universeTotals ?? demographyService.universeTotals) : undefined;
  const colorScheme = useColorScheme();
  const getZoneColor = useZoneColorGetter();
  const mapMode = useMapControlsStore(state => state.mapMode);
  const superDraw = useToolbarStore(state => state.superDraw);
  const communities = useMapStore(state => state.communities);
  const summaryStatConfig = summaryStatLabels.find(f => f.value === summaryType);
  const displayedStatLabels = summaryStatLabels.filter(f =>
    displayedColumnSets ? displayedColumnSets.includes(f.value) : true
  );
  const showSummaryTypeSelect = displayedStatLabels.length > 1;
  const showModeButtons = Boolean(
    summaryStatConfig?.supportedModes?.length && summaryStatConfig?.supportedModes?.length > 1
  );
  const numberFormat = numberFormats[evalMode];
  const isVoterHistory = summaryType === SUMMARY_TYPES.VOTERHISTORY;
  // Voter history columns are dem-share; Republican POV swaps to the rep-share columns.
  const effectiveColumnConfigs =
    isVoterHistory && pov === 'rep'
      ? columnConfigs.map(c => ({...c, column: c.column.replace('_dem', '_rep')}))
      : columnConfigs;

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

  const universeTotalColumn = TOTAL_COLUMN[summaryType];
  const summaryData = isCoalitionUniverse(summaryType)
    ? (summaryStats[summaryType] as Record<string, number> | undefined)
    : undefined;
  const universeRow =
    universeTotalColumn && summaryData && isCoalitionUniverse(summaryType)
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
      return [...filtered, ...(universeRow ? [universeRow] : [])];
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
    if (mapMode === MAP_MODES.COI) {
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
            <Flex direction="row" gap="2" align="center" wrap="wrap">
              <Text size="2" weight="medium">
                Summary type
              </Text>
              <SegmentedControl.Root
                size="1"
                value={summaryType}
                onValueChange={value => setSummaryType(value as SummaryType)}
              >
                {displayedStatLabels.map(({value, label}) => (
                  <SegmentedControl.Item key={value} value={value}>
                    {label}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
            </Flex>
          )}
        </Flex>
        {superDraw && (
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
                  <SegmentedControl.Root
                    size="1"
                    value={evalMode}
                    onValueChange={v => setEvalMode(v as EvalMode)}
                  >
                    {modeButtonConfig.map((mode, i) => (
                      <SegmentedControl.Item key={i} value={mode.value}>
                        {mode.label}
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl.Root>
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
                    Show unassigned population
                  </CheckboxGroup.Item>
                  <CheckboxGroup.Item value="colorBg" onClick={() => setColorBg(v => !v)}>
                    Color cells by values
                  </CheckboxGroup.Item>
                </CheckboxGroup.Root>
              </Flex>
            </Popover.Content>
          </Popover.Root>
        )}
      </Flex>
      {isVoterHistory && (
        <Flex direction="column" gap="1" pb="2">
          <Flex justify="start" align="center" gap="2">
            <Text size="2" weight="medium">
              Point of view
            </Text>
            <SegmentedControl.Root
              size="1"
              value={pov}
              onValueChange={v => setPov(v as PartisanPov)}
            >
              <SegmentedControl.Item value="dem">Democratic</SegmentedControl.Item>
              <SegmentedControl.Item value="rep">Republican</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
          <Text size="1" color="gray">
            Vote shares reflect the two major parties only.
          </Text>
        </Flex>
      )}
      <Box overflowX="auto" className="text-sm">
        <Table.Root className="min-w-full border-collapse">
          <EvaluationTableHeader
            columnConfigs={effectiveColumnConfigs}
            zoneHeader={mapMode === MAP_MODES.COI ? 'Community' : 'District'}
          />
          <EvaluationTableBody
            rows={rows}
            colorScheme={colorScheme}
            columnConfigs={effectiveColumnConfigs}
            evalMode={evalMode}
            colorBg={colorBg}
            summaryType={summaryType}
            numberFormat={numberFormat}
            maxValues={maxValues}
            mapMode={mapMode}
            communities={communities}
            getZoneColor={getZoneColor}
            pov={pov}
          />
        </Table.Root>
      </Box>
    </Box>
  );
};
const EvaluationTableHeader: React.FC<EvaluationTableHeaderProps> = ({
  columnConfigs,
  zoneHeader = 'District',
}) => {
  return (
    <Table.Header>
      <Table.Row className="bg-gray-50 border-b">
        <Table.ColumnHeaderCell className="py-1 px-2 align-middle text-left font-semibold">
          {zoneHeader}
        </Table.ColumnHeaderCell>
        {!!columnConfigs &&
          columnConfigs.map((f, i) => (
            <Table.ColumnHeaderCell
              className="py-1 px-2 align-middle text-right font-semibold"
              key={i}
            >
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
      {rows.map(row => (
        <EvaluationTableRow
          // Stable per-row key so React reconciles correctly when the rows
          // array is re-ordered (e.g., universe/unassigned swap). Array-index
          // keys would otherwise force re-mounts / miss updates. Unassigned
          // (zone === undefined) and universe rows need distinct keys.
          key={
            typeof row.zone === 'number'
              ? row.zone
              : row.zone === undefined
                ? 'unassigned'
                : 'universe'
          }
          {...props}
          row={row}
        />
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
  pov,
}) => {
  const isUniverse = Boolean((row as Record<string, unknown>).__isUniverse) || row.zone === 0;
  const isUnassigned = !isUniverse && row.zone === undefined;
  const zoneName = isUniverse ? (
    'Overall'
  ) : isUnassigned ? (
    <Tooltip content="Unassigned population">
      <span aria-label="Unassigned">∅</span>
    </Tooltip>
  ) : mapMode === MAP_MODES.COI ? (
    getCommunityDisplayNumber(communities, row.zone as number)
  ) : (
    row.zone
  );
  const backgroundColor = isUniverse
    ? '#111111'
    : isUnassigned
      ? '#DDDDDD'
      : getZoneColor(row.zone as number, colorScheme[(row.zone as number) - 1] ?? '#000000');

  return (
    <Table.Row className={`border-b ${isUniverse ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
      <Table.Cell
        className={`py-1 px-2 align-middle font-medium flex flex-row items-center gap-1 ${isUniverse ? 'font-semibold' : ''}`}
      >
        <span className={'size-4 inline-block rounded-md'} style={{backgroundColor}}></span>
        {zoneName}
      </Table.Cell>
      {!!columnConfigs &&
        columnConfigs.map(columnConfig => (
          <EvaluationTableCell
            key={columnConfig.column}
            row={row}
            evalMode={evalMode}
            columnConfig={columnConfig}
            isUniverse={isUniverse}
            isUnassigned={isUnassigned}
            colorBg={colorBg}
            summaryType={summaryType}
            numberFormat={numberFormat}
            maxValues={maxValues}
            pov={pov}
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
  pov,
}) => {
  const column = evalMode === EVAL_MODES.COUNT ? columnConfig.column : `${columnConfig.column}_pct`;
  const value = (row as Record<string, number | undefined>)[column];
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  let colorValue: number | undefined;
  if (numericValue !== undefined) {
    colorValue =
      evalMode === EVAL_MODES.COUNT && maxValues[column] !== 0
        ? numericValue / maxValues[column]
        : numericValue;
  }
  const hasValidColorValue =
    colorValue !== undefined && typeof colorValue === 'number' && Number.isFinite(colorValue);
  let backgroundColor: string | undefined;
  if (!hasValidColorValue || isUniverse) {
  } else if (colorBg && summaryType === SUMMARY_TYPES.VOTERHISTORY) {
    // Diverging red <- white -> blue keyed to the two-party dem share, matching
    // the choropleth map; identical coloring in either POV.
    backgroundColor = PARTISAN_SCALE(pov === 'dem' ? numericValue! : 1 - numericValue!);
  } else if (colorBg && !isUnassigned) {
    backgroundColor = interpolateGreys(colorValue as number)
      .replace('rgb', 'rgba')
      .replace(')', ',0.5)');
  } else {
    backgroundColor = 'initial';
  }

  return (
    <Table.Cell
      className={`py-1 px-2 align-middle text-right ${isUniverse ? 'font-semibold' : ''}`}
      style={{
        backgroundColor,
      }}
    >
      {numericValue === undefined ? '--' : formatNumber(numericValue, numberFormat)}
    </Table.Cell>
  );
};
export default Evaluation;
