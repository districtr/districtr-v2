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
import {formatNumber} from '@/app/utils/numbers';
import {interpolateGreys} from 'd3-scale-chromatic';
import {SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
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
import {COALITION_VARIABLE_BY_UNIVERSE} from '@/app/utils/demography/coalition';

type EvaluationProps = {
  summaryType: keyof SummaryStatConfig;
  setSummaryType: (summaryType: keyof SummaryStatConfig) => void;
  displayedColumnSets?: Array<keyof SummaryStatConfig>;
  columnConfig: Array<{
    label: string;
    column: string;
    sourceCol?: string;
    tooltip?: string;
  }>;
};
const Evaluation: React.FC<EvaluationProps> = ({
  summaryType,
  setSummaryType,
  displayedColumnSets,
  columnConfig,
}) => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const {zoneStats, demoIsLoaded, zoneData, summaryStats} = useSummaryStats(showUnassigned);

  const maxValues = zoneStats?.maxValues;
  const colorScheme = useColorScheme();
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
  const coalitionStats =
    summaryType === 'TOTPOP' || summaryType === 'VAP'
      ? demographyCache.getCoalitionUniverseStats(summaryType)
      : undefined;
  const universeRow =
    universeTotalColumn && summaryData
      ? (() => {
          const row: Record<string, number | string | boolean> = {
            zone: 'Universe',
            __isUniverse: true,
          };
          const universeTotal = summaryData[universeTotalColumn];
          columnConfig.forEach(config => {
            if (
              (summaryType === 'TOTPOP' || summaryType === 'VAP') &&
              config.column === COALITION_VARIABLE_BY_UNIVERSE[summaryType]
            ) {
              row[config.column] = coalitionStats?.coalitionTotal ?? 0;
              row[`${config.column}_pct`] = coalitionStats?.coalitionPct ?? NaN;
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
        })()
      : undefined;

  const rows = [
    ...zoneData.sort((a, b) => (a.zone || 0) - (b.zone || 0)),
    ...(universeRow ? [universeRow] : []),
  ];

  return (
    <Box width={'100%'}>
      <Flex direction="row" gap="3" align="center" pb="2">
        <Flex direction="column" gap="1" flexGrow="1">
          <Heading as="h3" size="3">
            Demographic table
          </Heading>
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
            <IconButton
              variant="ghost"
              size="3"
              aria-label="Choose map districtr assignment brush color"
            >
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
          <Table.Header>
            <Table.Row className="bg-gray-50 border-b">
              <Table.ColumnHeaderCell className="py-2 px-4 text-left font-semibold">
                Zone
              </Table.ColumnHeaderCell>
              {!!columnConfig &&
                columnConfig.map((f, i) => (
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
          <Table.Body>
            {rows.map((row, i) => {
              const isUniverse = Boolean((row as Record<string, unknown>).__isUniverse);
              const isUnassigned = !isUniverse && row.zone === undefined;
              const zoneName = isUniverse ? 'Universe' : isUnassigned ? 'None' : row.zone;
              const backgroundColor = isUniverse
                ? '#111111'
                : isUnassigned
                  ? '#DDDDDD'
                  : colorScheme[(row.zone as number) - 1];

              return (
                <Table.Row
                  key={`eval-row-${i}`}
                  className={`border-b ${isUniverse ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                >
                  <Table.Cell
                    className={`py-2 px-4 font-medium flex flex-row items-center gap-1 ${isUniverse ? 'font-semibold' : ''}`}
                  >
                    <span
                      className={'size-4 inline-block rounded-md'}
                      style={{backgroundColor}}
                    ></span>
                    {zoneName}
                  </Table.Cell>
                  {!!columnConfig &&
                    columnConfig.map((f, i) => {
                      const column = evalMode === 'count' ? f.column : `${f.column}_pct`;
                      const value = (row as Record<string, number | undefined>)[column];
                      const numericValue =
                        typeof value === 'number' && Number.isFinite(value) ? value : undefined;
                      const colorValue =
                        numericValue === undefined
                          ? undefined
                          : evalMode === 'count'
                            ? // @ts-ignore
                              numericValue / maxValues[column]
                            : numericValue;
                      const hasValidColorValue =
                        colorValue !== undefined &&
                        typeof colorValue === 'number' &&
                        Number.isFinite(colorValue);
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
                          key={i}
                        >
                          {numericValue === undefined
                            ? '--'
                            : formatNumber(numericValue, numberFormat)}
                        </Table.Cell>
                      );
                    })}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>
    </Box>
  );
};

export default Evaluation;
