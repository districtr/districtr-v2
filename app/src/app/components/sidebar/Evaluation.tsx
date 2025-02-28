import React, {useEffect, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {Box, Button, CheckboxGroup, Heading, Tabs} from '@radix-ui/themes';
import {Flex, Text} from '@radix-ui/themes';
import {formatNumber, NumberFormats} from '@/app/utils/numbers';
import {colorScheme} from '@/app/constants/colors';
import {interpolateGreys} from 'd3-scale-chromatic';
import {
  P1ZoneSummaryStats,
  P4ZoneSummaryStats,
  SummaryStatKeys,
  SummaryTypes,
  TotalColumnKeys,
} from '@/app/utils/api/summaryStats';
import { useDemography, useSummaryStats } from '@/app/utils/demography/demographyCache';

type EvalModes = 'share' | 'count' | 'totpop';
type ColumnConfiguration<T extends Record<string, any>> = Array<{label: string; column: keyof T}>;

const p1ColumnConfig: ColumnConfiguration<P1ZoneSummaryStats> = [
  {
    label: 'White',
    column: 'white_pop',
  },
  {
    label: 'Black',
    column: 'black_pop',
  },
  {
    label: 'Asian',
    column: 'asian_pop',
  },
  {
    label: 'Am. Indian',
    column: 'amin_pop',
  },
  {
    label: 'Pacific Isl.',
    column: 'nhpi_pop',
  },
  {
    label: 'Two or More Races',
    column: 'two_or_more_races_pop',
  },
  {
    label: 'Other',
    column: 'other_pop',
  },
];

const p4ColumnConfig: ColumnConfiguration<P4ZoneSummaryStats> = [
  {column: 'hispanic_vap', label: 'Hispanic'},
  {column: 'non_hispanic_asian_vap', label: 'Non-hispanic Asian'},
  {column: 'non_hispanic_amin_vap', label: 'Non-hispanic Amin.'},
  {column: 'non_hispanic_nhpi_vap', label: 'Non-hispanic NHPI'},
  {column: 'non_hispanic_black_vap', label: 'Non-hispanic Black'},
  {column: 'non_hispanic_white_vap', label: 'Non-hispanic White'},
  {column: 'non_hispanic_other_vap', label: 'Non-hispanic Other'},
  {column: 'non_hispanic_two_or_more_races_vap', label: 'Non-hispanic 2+ Races'},
];

const columnConfigs = {
  P1: p1ColumnConfig,
  P4: p4ColumnConfig,
} as const;

const modeButtonConfig: Array<{label: string; value: EvalModes}> = [
  {
    label: 'Population by Share',
    value: 'share',
  },
  {
    label: 'Population by Count',
    value: 'count',
  },
];

const numberFormats: Record<EvalModes, NumberFormats> = {
  share: 'percent',
  count: 'string',
  totpop: 'percent',
};

const summaryStatLabels: Array<{
  value: keyof SummaryTypes;
  label: string;
}> = [
  {
    value: 'P1',
    label: 'Total Population',
  },
  {
    value: 'P4',
    label: 'Voting Age Population',
  }
]

const Evaluation: React.FC = () => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);
  const {populationData} = useDemography();
  const summaryStats = useSummaryStats();
  const maxValues = summaryStats?.maxValues;
  const numberFormat = numberFormats[evalMode];
  const mapDocument = useMapStore(state => state.mapDocument);
  const availableSummaries = summaryStatLabels.filter(f => mapDocument?.available_summary_stats?.includes(f.value));
  const assignmentsHash = useMapStore(state => state.assignmentsHash);
  const [summaryType, setSummaryType] = useState<keyof SummaryTypes | undefined>(
    (mapDocument?.available_summary_stats?.includes('P1')
      ? 'P1'
      : mapDocument?.available_summary_stats?.[0]) as keyof SummaryTypes
  );
  const totals = summaryStats?.[summaryType as keyof typeof summaryStats];
  const unassigned = false;
  useEffect(() => {
    const hasCurrent = summaryType && mapDocument?.available_summary_stats?.includes(summaryType);
    if (!hasCurrent) {
      setSummaryType(mapDocument?.available_summary_stats?.[0] as keyof SummaryTypes);
    }
  }, [mapDocument?.available_summary_stats])


  const columnConfig = summaryType ? columnConfigs[summaryType] : [];
  const summaryStatKeys = summaryType ? SummaryStatKeys[summaryType] : [];
  const totalColumn = summaryType ? TotalColumnKeys[summaryType] : undefined;

  if (!populationData || !maxValues || (mapDocument && !mapDocument.available_summary_stats)) {
    return <Text>Summary statistics are not available for this map.</Text>;
  }

  const rows = unassigned && showUnassigned ? [...populationData, unassigned] : populationData
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
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="py-2 px-4 text-left font-semibold">Zone</th>
              {columnConfig.map((f, i) => (
                <th className="py-2 px-4 text-right font-semibold" key={i}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a: any, b: any) => a.zone - b.zone)
              .map((row: any) => {
                const isUnassigned = row.zone === -999;
                const zoneName = isUnassigned ? 'None' : row.zone;
                const backgroundColor = isUnassigned ? '#DDDDDD' : colorScheme[row.zone - 1];

                return (
                  <tr key={row.zone} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium flex flex-row items-center gap-1">
                      <span
                        className={'size-4 inline-block rounded-md'}
                        style={{backgroundColor}}
                      ></span>
                      {zoneName}
                    </td>
                    {columnConfig.map((f, i) => {
                      const column = (
                        evalMode === 'count' ? f.column : `${f.column}_pct`
                      ) as keyof typeof row;
                      const value = row[column];
                      // @ts-ignore
                      const colorValue = evalMode === 'count' ? value / maxValues[column] : value;
                      const backgroundColor =
                        colorBg && !isUnassigned
                          ? interpolateGreys(colorValue)
                              .replace('rgb', 'rgba')
                              .replace(')', ',0.5)')
                          : 'initial';
                      return (
                        <td
                          className="py-2 px-4 text-right"
                          style={{
                            backgroundColor,
                          }}
                          key={i}
                        >
                          {formatNumber(value, numberFormat)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Box>
    </Box>
  );
};

export default Evaluation;
