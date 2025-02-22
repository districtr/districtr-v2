import React, {useMemo, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useQuery} from '@tanstack/react-query';
import {getDocumentEvaluationStats} from '@/app/utils/api/apiHandlers';
import {Box, Button, CheckboxGroup, Heading, Tabs} from '@radix-ui/themes';
import {Flex, Spinner, Text} from '@radix-ui/themes';
import {queryClient} from '@utils/api/queryClient';
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

const summaryStatLabels: Record<keyof SummaryTypes, string> = {
  P1: 'Total Population',
  P4: 'Voting Age Population',
};

const Evaluation: React.FC = () => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [colorBg, setColorBg] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);

  const numberFormat = numberFormats[evalMode];
  const mapDocument = useMapStore(state => state.mapDocument);
  const assignmentsHash = useMapStore(state => state.assignmentsHash);
  const [summaryType, setSummaryType] = useState<keyof SummaryTypes | undefined>(
    (mapDocument?.available_summary_stats?.includes('P1')
      ? 'P1'
      : mapDocument?.available_summary_stats?.[0]) as keyof SummaryTypes
  );
  const totals = useMapStore(state => (summaryType ? state.summaryStats[summaryType] : undefined));

  const {data, error, isLoading} = useQuery(
    {
      queryKey: ['SummaryStats', mapDocument, assignmentsHash, summaryType],
      queryFn: () =>
        mapDocument && summaryType && getDocumentEvaluationStats(mapDocument, summaryType),
      enabled: !!mapDocument,
      staleTime: 0,
      placeholderData: previousData => previousData,
    },
    queryClient
  );

  const columnConfig = summaryType ? columnConfigs[summaryType] : [];
  const summaryStatKeys = summaryType ? SummaryStatKeys[summaryType] : [];
  const totalColumn = summaryType ? TotalColumnKeys[summaryType] : undefined;

  const {unassigned, maxValues} = useMemo(() => {
    if (!data?.results || !totals || !totalColumn) {
      return {};
    }
    let maxValues: Record<string, number> = {};
    let unassigned: Record<string, number> = {
      ...totals,
      zone: -999,
      total: totals[totalColumn as keyof typeof totals],
    };

    summaryStatKeys.forEach(key => {
      let total = unassigned[key];
      maxValues[key] = -Math.pow(10, 12);
      data.results.forEach(row => {
        const value = row[key as keyof typeof row];
        total -= value;
        maxValues[key] = Math.max(value, maxValues[key]);
      });
      unassigned[`${key}_pct`] = total / unassigned['total'];
      unassigned[key] = total;
    });

    return {
      unassigned,
      maxValues,
    };
  }, [data?.results, totals, totalColumn, summaryStatKeys]);

  if (!data || !maxValues || (mapDocument && !mapDocument.available_summary_stats)) {
    return <Text>Summary statistics are not available for this map.</Text>;
  }

  if (error) {
    return (
      <div>
        <h1>Summary Statistics</h1>
        <p>There was an error loading the summary statistics.</p>
      </div>
    );
  }
  const rows = unassigned && showUnassigned ? [...data.results, unassigned] : data.results;
  return (
    <Box width={'100%'}>
      <Tabs.Root
        value={summaryType}
        onValueChange={value => setSummaryType(value as keyof SummaryTypes)}
      >
        <Tabs.List>
          {Object.entries(summaryStatLabels).map(([key, value]) => (
            <Tabs.Trigger key={key} value={key}>
              <Heading as="h3" size="3">
                {value}
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
        {isLoading && <Spinner />}
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
              .sort((a, b) => a.zone - b.zone)
              .map(row => {
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
