import React, {useEffect, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
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
  Tabs,
} from '@radix-ui/themes';
import {Flex, Text} from '@radix-ui/themes';
import {formatNumber} from '@/app/utils/numbers';
import {interpolateGreys} from 'd3-scale-chromatic';
import {AllEvaluationConfigs, SummaryRecord, SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {
  EvalModes,
  modeButtonConfig,
  numberFormats,
  summaryStatLabels,
} from '@/app/store/demography/evaluationConfig';
import {PARTISAN_SCALE} from '@/app/store/demography/constants';
import {GearIcon} from '@radix-ui/react-icons';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {
  compareCoiZonesByRenderOrder,
  getCoiCommunityDisplayNumber,
} from '@/app/utils/coiCommunities';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

type EvaluationProps = {
  summaryType: keyof SummaryStatConfig;
  setSummaryType: (summaryType: keyof SummaryStatConfig) => void;
  displayedColumnSets?: Array<keyof SummaryStatConfig>;
  columnConfig: AllEvaluationConfigs;
  singleZone?: number;
  universeTotals?: SummaryRecord | null;
};
const Evaluation: React.FC<EvaluationProps> = ({
  summaryType,
  columnConfig,
  singleZone,
  universeTotals,
}) => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const {zoneStats, demoIsLoaded, zoneData} = useSummaryStats(showUnassigned);

  const maxValues = zoneStats?.maxValues;
  const effectiveUniverseTotals =
    singleZone != null ? (universeTotals ?? demographyCache.universeTotals) : undefined;
  const displayData = (() => {
    let rows = zoneData ?? [];
    if (singleZone != null) {
      rows = rows.filter(r => r.zone === singleZone);
    }
    if (effectiveUniverseTotals) {
      rows = [...rows, effectiveUniverseTotals];
    }
    return rows;
  })();
  const colorScheme = useColorScheme();
  const getZoneColor = useZoneColorGetter();
  const mapMode = useMapControlsStore(state => state.mapMode);
  const coiCommunities = useMapStore(state => state.coiCommunities);
  const summaryStatConfig = summaryStatLabels.find(f => f.value === summaryType);
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

  return (
    <Box width={'100%'}>
      <Flex direction="row" gap="3" align="center" pb="2">
        <Heading as="h3" size="3">
          Evaluation
        </Heading>
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
                    {f.label}
                  </Table.ColumnHeaderCell>
                ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {displayData
              .sort((a, b) => {
                if (a.zone === undefined) return -1;
                if (b.zone === undefined) return 1;
                if (a.zone === 0) return -1;
                if (b.zone === 0) return 1;
                if (mapMode === 'coi') {
                  return compareCoiZonesByRenderOrder(a.zone, b.zone, coiCommunities);
                }
                return (a.zone || 0) - (b.zone || 0);
              })
              .map((row, i) => {
                const isUnassigned = row.zone === undefined;
                const isUniverse = row.zone === 0;
                const zoneName = isUniverse
                  ? 'Overall'
                  : isUnassigned
                    ? 'None'
                    : mapMode === 'coi'
                      ? getCoiCommunityDisplayNumber(coiCommunities, row.zone)
                      : row.zone;
                const backgroundColor = isUniverse
                  ? '#9CA3AF'
                  : isUnassigned
                    ? '#DDDDDD'
                    : getZoneColor(row.zone, colorScheme[row.zone - 1] ?? '#000000');

                return (
                  <Table.Row key={`eval-row-${i}`} className="border-b hover:bg-gray-50">
                    <Table.Cell className="py-2 px-4 font-medium flex flex-row items-center gap-1">
                      <span
                        className={'size-4 inline-block rounded-md'}
                        style={{backgroundColor}}
                      ></span>
                      {zoneName}
                    </Table.Cell>
                    {!!columnConfig &&
                      columnConfig.map((f, i) => {
                        const column = (
                          evalMode === 'count' ? f.column : `${f.column}_pct`
                        ) as keyof typeof row;
                        const value = row[column];
                        const colorValue =
                          value === undefined
                            ? undefined
                            : evalMode === 'count'
                              ? // @ts-ignore
                                value / maxValues[column]
                              : value;
                        let backgroundColor: string | undefined;
                        if (value === undefined || colorValue === undefined) {
                        } else if (colorBg && summaryType === 'VOTERHISTORY') {
                          backgroundColor = PARTISAN_SCALE(((value as number) + 1) / 2);
                        } else if (colorBg && !isUnassigned && !isUniverse) {
                          backgroundColor = interpolateGreys(colorValue as number)
                            .replace('rgb', 'rgba')
                            .replace(')', ',0.5)');
                        } else {
                          backgroundColor = 'initial';
                        }
                        return (
                          <Table.Cell
                            className="py-2 px-4 text-right"
                            style={{
                              backgroundColor,
                            }}
                            key={i}
                          >
                            {value === undefined || Number.isNaN(value)
                              ? '--'
                              : formatNumber(value as number, numberFormat)}
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
