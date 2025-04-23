import React, {useEffect, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Blockquote, Box, Button, CheckboxGroup, Heading, Spinner, Table, Tabs} from '@radix-ui/themes';
import {Flex, Text} from '@radix-ui/themes';
import {formatNumber} from '@/app/utils/numbers';
import {interpolateGreys} from 'd3-scale-chromatic';
import {SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {useDemography} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import { EvalModes, modeButtonConfig, numberFormats, summaryStatLabels } from '@/app/store/demography/evaluationConfig';
import { useDemographyStore } from '@/app/store/demography/demographyStore';

const Evaluation: React.FC = () => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const {populationData, demoIsLoaded} = useDemography(showUnassigned);
  console.log('!!!', populationData)
  const {summaryStats, zoneStats} = useSummaryStats();
  const maxValues = zoneStats?.maxValues;
  const numberFormat = numberFormats[evalMode];
  const availableSummaries = useDemographyStore(state => state.availableColumnSets.evaluation);
  const availableColumnSets = Object.keys(availableSummaries) as Array<keyof SummaryStatConfig>;
  const colorScheme = useMapStore(state => state.colorScheme);
  const [summaryType, setSummaryType] = useState<keyof SummaryStatConfig | undefined>(
    !availableColumnSets.length ? undefined : availableColumnSets.includes("VAP") ? 'VAP' : availableColumnSets[0]);

  useEffect(() => {
    if (!availableColumnSets.length) return;
    const hasCurrent = summaryType && availableSummaries[summaryType];
    if (!hasCurrent) {
      setSummaryType(availableColumnSets.includes("VAP") ? "VAP" : availableColumnSets[0]);
    }
  }, [availableSummaries]);
  const columnConfig = summaryType ? availableSummaries[summaryType] : [];

  // const summaryStatKeys = summaryType ? summaryStatsConfig[summaryType] : [];
  // const totalColumn = 'sumColumn' in summaryStatKeys ? summaryStatKeys.sumColumn : undefined;
  if (!demoIsLoaded) {
    return <Flex dir='column' justify='center' align='center' p='4'>
      <Spinner />
      <Text size="2" className="ml-2">
        Loading evaluation data...
      </Text>
    </Flex>;
  }
  if (!populationData || !maxValues || !availableColumnSets.length) {
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
        onValueChange={value => setSummaryType(value as keyof SummaryStatConfig)}
      >
        <Tabs.List>
          {summaryStatLabels.filter(f=> availableColumnSets.includes(f.value)).map(({value, label}) => (
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
              {!!columnConfig &&
                columnConfig.map((f, i) => (
                  <Table.ColumnHeaderCell className="py-2 px-4 text-right font-semibold" key={i}>
                    {f.label}
                  </Table.ColumnHeaderCell>
                ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {populationData
              .sort((a, b) => (a.zone || 0) - (b.zone || 0))
              .map((row, i) => {
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
                        const backgroundColor =
                          value === undefined || colorValue === undefined
                            ? undefined
                            : colorBg && !isUnassigned
                              ? interpolateGreys(colorValue as number)
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
                            {value === undefined
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
