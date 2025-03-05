import React, {useEffect, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Blockquote, Box, Button, CheckboxGroup, Heading, Table, Tabs} from '@radix-ui/themes';
import {Flex, Text} from '@radix-ui/themes';
import {formatNumber} from '@/app/utils/numbers';
import {colorScheme} from '@/app/constants/colors';
import {interpolateGreys} from 'd3-scale-chromatic';
import {SummaryStatKeys, SummaryTypes, TotalColumnKeys} from '@/app/utils/api/summaryStats';
import {
  numberFormats,
  summaryStatLabels,
  EvalModes,
  columnConfigs,
  modeButtonConfig,
} from './config';
import { useDemography } from '@/app/hooks/useDemography';
import { useSummaryStats } from '@/app/hooks/useSummaryStats';

const Evaluation: React.FC = () => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const {populationData} = useDemography(showUnassigned);
  const {summaryStats, zoneStats} = useSummaryStats();
  const maxValues = zoneStats?.maxValues;
  const numberFormat = numberFormats[evalMode];
  const mapDocument = useMapStore(state => state.mapDocument);
  const availableSummaries = summaryStatLabels.filter(f =>
    mapDocument?.available_summary_stats?.includes(f.value)
  );
  const assignmentsHash = useMapStore(state => state.assignmentsHash);
  const [summaryType, setSummaryType] = useState<keyof SummaryTypes | undefined>(
    (mapDocument?.available_summary_stats?.includes('P4')
      ? 'P4'
      : mapDocument?.available_summary_stats?.[0]) as keyof SummaryTypes
  );
  const totals = summaryStats?.[summaryType as keyof typeof summaryStats];

  useEffect(() => {
    const hasCurrent = summaryType && mapDocument?.available_summary_stats?.includes(summaryType);
    if (!hasCurrent) {
      setSummaryType(mapDocument?.available_summary_stats?.[0] as keyof SummaryTypes);
    }
  }, [mapDocument?.available_summary_stats]);

  const columnConfig = summaryType ? columnConfigs[summaryType] : [];
  const summaryStatKeys = summaryType ? SummaryStatKeys[summaryType] : [];
  const totalColumn = summaryType ? TotalColumnKeys[summaryType] : undefined;

  if (!populationData || !maxValues || (mapDocument && !mapDocument.available_summary_stats)) {
    return (
      <Blockquote color="crimson">
        <Text>Summary statistics are not available for this map.</Text>
      </Blockquote>
    );
  }

  return (
    <Box width={'100%'}>
      <Tabs.Root
        value={summaryType}
        onValueChange={value => setSummaryType(value as keyof SummaryTypes)}
      >
        <Tabs.List>
          {availableSummaries.map(({value, label}) => (
            <Tabs.Trigger key={value} value={value}>
              <Heading as="h3" size="3">
                {label}
              </Heading>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <Flex align="center" gap="3" my="2">
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
      <Flex align="center" gap="3" mt="1">
        <CheckboxGroup.Root
          defaultValue={[]}
          orientation="horizontal"
          name="evaluation-options"
          value={[
            // showAverages ? 'averages' : '',
            // showStdDev ? 'stddev' : '',
            colorBg ? 'colorBg' : '',
            showUnassigned ? 'unassigned' : '',
          ]}
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
      <Box overflowX="auto" className="text-sm">
        <Table.Root className="min-w-full border-collapse">
          <Table.Header>
            <Table.Row className="bg-gray-50 border-b">
              <Table.ColumnHeaderCell className="py-2 px-4 text-left font-semibold">
                Zone
              </Table.ColumnHeaderCell>
              {columnConfig.map((f, i) => (
                <Table.ColumnHeaderCell className="py-2 px-4 text-right font-semibold" key={i}>
                  {f.label}
                </Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {populationData
              .sort((a: any, b: any) => (a.zone||0) - (b.zone||0))
              .map((row: any, i: number) => {
                const isUnassigned = row.zone === undefined;
                const zoneName = isUnassigned ? 'None' : row.zone;
                const backgroundColor = isUnassigned ? '#DDDDDD' : colorScheme[row.zone - 1];

                return (
                  <Table.Row key={`eval-row-${i}`} className="border-b hover:bg-gray-50">
                    <Table.Cell className="py-2 px-4 font-medium flex flex-row items-center gap-1">
                      <span
                        className={'size-4 inline-block rounded-md'}
                        style={{backgroundColor}}
                      ></span>
                      {zoneName}
                    </Table.Cell>
                    {columnConfig.map((f, i) => {
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
                      const backgroundColor =
                        value === undefined
                          ? undefined
                          : colorBg && !isUnassigned
                            ? interpolateGreys(colorValue)
                                .replace('rgb', 'rgba')
                                .replace(')', ',0.5)')
                            : 'initial';
                      return (
                        <Table.Cell
                          className="py-2 px-4 text-right"
                          style={{
                            backgroundColor,
                          }}
                          key={i}
                        >
                          {value === undefined ? '--' : formatNumber(value, numberFormat)}
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
