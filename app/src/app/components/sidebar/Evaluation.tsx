import React, {useMemo, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useQuery} from '@tanstack/react-query';
import {
  CleanedP1ZoneSummaryStats,
  CleanedP1ZoneSummaryStatsKeys,
  getP1SummaryStats,
  P1ZoneSummaryStats,
  P1ZoneSummaryStatsKeys,
} from '@/app/utils/api/apiHandlers';
import {Button, Checkbox, CheckboxGroup} from '@radix-ui/themes';
import {Heading, Flex, Spinner, Text} from '@radix-ui/themes';
import {queryClient} from '@utils/api/queryClient';
import {formatNumber, NumberFormats} from '@/app/utils/numbers';
import {colorScheme} from '@/app/constants/colors';
import {
  getEntryTotal,
  getStdDevColor,
  stdDevArray,
  stdDevColors,
  sumArray,
} from '@/app/utils/summaryStats';

type EvalModes = 'share' | 'count' | 'totpop';
type ColumnConfiguration<T extends Record<string, any>> = Array<{label: string; column: keyof T}>;
type EvaluationProps = {
  columnConfig: ColumnConfiguration<P1ZoneSummaryStats>;
};

// const calculateColumn = (
//   mode: EvalModes,
//   entry: P1ZoneSummaryStats,
//   totals: P1ZoneSummaryStats,
//   column: keyof Omit<CleanedP1ZoneSummaryStats, 'zone'>
// ) => {
//   const count = entry[column];
//   switch (mode) {
//     case 'count':
//       return count;
//     case 'pct':
//       return count / entry['total'];
//     case 'share':
//       return count / totals[column];
//   }
// };

const defaultColumnConfig: ColumnConfiguration<P1ZoneSummaryStats> = [
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
    label: 'Other',
    column: 'other_pop',
  },
];

const modeButtonConfig: Array<{label: string; value: EvalModes}> = [
  {
    label: 'Population by Share',
    value: 'share',
  },
  {
    label: 'Population by Count',
    value: 'count',
  },
  // {
  //   label: "Population by Percent of Zone",
  //   value: 'totpop'
  // }
];

const numberFormats: Record<EvalModes, NumberFormats> = {
  share: 'percent',
  count: 'string',
  totpop: 'percent',
};

const getColConfig = (evalMode: EvalModes) => {
  switch (evalMode) {
    case 'share':
      return (col: keyof P1ZoneSummaryStats) => `${col}_pct` as keyof CleanedP1ZoneSummaryStats;
    default:
      return (col: keyof P1ZoneSummaryStats) => col;
  }
};

const Evaluation: React.FC<EvaluationProps> = ({columnConfig = defaultColumnConfig}) => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');
  const [showAverages, setShowAverages] = useState<boolean>(true);
  const [showStdDev, setShowStdDev] = useState<boolean>(false);
  const [colorByStdDev, setColorByStdDev] = useState<boolean>(true);
  const [showUnassigned, setShowUnassigned] = useState<boolean>(true);

  const numberFormat = numberFormats[evalMode];
  const columnGetter = getColConfig(evalMode);
  const totPop = useMapStore(state => state.summaryStats.totpop?.data);
  const mapDocument = useMapStore(state => state.mapDocument);
  const assignmentsHash = useMapStore(state => state.assignmentsHash);

  const {data, error, isLoading} = useQuery(
    {
      queryKey: ['p1SummaryStats', mapDocument, assignmentsHash],
      queryFn: () => mapDocument && getP1SummaryStats(mapDocument),
      enabled: !!mapDocument,
      staleTime: 0,
      placeholderData: previousData => previousData,
    },
    queryClient
  );

  const {unassigned, averages, stdDevs} = useMemo(() => {
    if (!data?.results || !totPop) {
      return {};
    }
    let unassigned: Record<string, number> = {
      ...totPop,
      zone: -999,
      total: getEntryTotal(totPop),
    };
    P1ZoneSummaryStatsKeys.forEach(key => {
      let total = unassigned[key];
      data.results.forEach(row => (total -= row[key]));
      unassigned[`${key}_pct`] = total / unassigned[key];
      unassigned[key] = total;
    });
    const averages: Record<string, number> = {};
    const stdDevs: Record<string, number> = {};
    CleanedP1ZoneSummaryStatsKeys.forEach(key => {
      const values = data.results.map(row => row[key]);
      averages[key] = sumArray(values) / data.results.length;
      stdDevs[key] = stdDevArray(values);
    });
    return {unassigned, averages, stdDevs};
  }, [data?.results, totPop]);

  if (!data || (mapDocument && !mapDocument.available_summary_stats)) {
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
    <div className="w-full">
      <Flex align="center" gap="3" mt="1">
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
            showAverages ? 'averages' : '',
            showStdDev ? 'stddev' : '',
            colorByStdDev ? 'colorstddev' : '',
            showUnassigned ? 'unassigned' : '',
          ]}
        >
          <CheckboxGroup.Item value="unassigned" onClick={() => setShowUnassigned(v => !v)}>
            Show Unassigned Population
          </CheckboxGroup.Item>
          <CheckboxGroup.Item value="averages" onClick={() => setShowAverages(v => !v)}>
            Show Zone Averages
          </CheckboxGroup.Item>
          <CheckboxGroup.Item value="stddev" onClick={() => setShowStdDev(v => !v)}>
            Show Zone Std. Dev.
          </CheckboxGroup.Item>
          <CheckboxGroup.Item value="colorstddev" onClick={() => setColorByStdDev(v => !v)}>
            <Flex gap="3">
              <p>Color Values By Std. Dev</p>
              {colorByStdDev && (
                <span>
                  {Object.entries(stdDevColors)
                    .sort((a, b) => +a[0] - +b[0])
                    .map(([stdev, backgroundColor], i) => (
                      <span
                        className="inline-flex items-center justify-center size-6"
                        style={{backgroundColor}}
                      >
                        {number}
                      </span>
                    ))}
                </span>
              )}
            </Flex>
          </CheckboxGroup.Item>
        </CheckboxGroup.Root>
      </Flex>
      <div className="overflow-x-auto text-sm">
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
            {!!(averages && showAverages) && (
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-4 font-medium flex flex-row items-center gap-1">
                  Zone Averages
                </td>
                {columnConfig.map((f, i) => (
                  <td className="py-2 px-4 text-right">
                    {formatNumber(averages[columnGetter(f.column)], numberFormat)}
                  </td>
                ))}
              </tr>
            )}
            {!!(stdDevs && showStdDev) && (
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-4 font-medium flex flex-row items-center gap-1">
                  Zone Std. Dev.
                </td>
                {columnConfig.map((f, i) => (
                  <td className="py-2 px-4 text-right">
                    {formatNumber(stdDevs[columnGetter(f.column)], numberFormat)}
                  </td>
                ))}
              </tr>
            )}
            {rows
              .sort((a, b) => a.zone - b.zone)
              .map(row => {
                const isUnassigned = row.zone === -999;
                const zoneName = isUnassigned ? 'Unassigned' : row.zone;
                const backgroundColor = isUnassigned ? '#BBBBBB' : colorScheme[row.zone - 1];

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
                      const column = columnGetter(f.column);
                      const stdDevFromMean =
                        stdDevs && averages && !isUnassigned && colorByStdDev
                          ? (row[column] - averages[column]) / stdDevs[column]
                          : undefined;
                      const backgroundColor =
                        stdDevFromMean !== undefined ? getStdDevColor(stdDevFromMean) : '';
                      return (
                        <td
                          className="py-2 px-4 text-right"
                          style={{
                            backgroundColor,
                          }}
                        >
                          {formatNumber(row[column], numberFormat)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Evaluation;
