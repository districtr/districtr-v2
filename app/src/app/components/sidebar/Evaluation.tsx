import React, {useMemo, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useQuery} from '@tanstack/react-query';
import {
  CleanedP1ZoneSummaryStats,
  getP1SummaryStats,
  P1ZoneSummaryStats,
  P1ZoneSummaryStatsKeys,
} from '@/app/utils/api/apiHandlers';
import {Button, CheckboxGroup} from '@radix-ui/themes';
import {Flex, Spinner, Text} from '@radix-ui/themes';
import {queryClient} from '@utils/api/queryClient';
import {formatNumber, NumberFormats} from '@/app/utils/numbers';
import {colorScheme} from '@/app/constants/colors';
import {getEntryTotal} from '@utils/summaryStats';
import {interpolateGreys} from 'd3-scale-chromatic';

type EvalModes = 'share' | 'count' | 'totpop';
type ColumnConfiguration<T extends Record<string, any>> = Array<{label: string; column: keyof T}>;
type EvaluationProps = {
  columnConfig?: ColumnConfiguration<P1ZoneSummaryStats>;
};

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
    label: 'Two or More Races',
    column: 'two_or_more_races_pop',
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
  const [colorBg, setColorBg] = useState<boolean>(true);
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

  const {
    unassigned,
    maxValues,
    // averages,
    // stdDevs
  } = useMemo(() => {
    if (!data?.results || !totPop) {
      return {};
    }
    let maxValues: Record<string, number> = {};

    let unassigned: Record<string, number> = {
      ...totPop,
      zone: -999,
      total: getEntryTotal(totPop),
    };
    P1ZoneSummaryStatsKeys.forEach(key => {
      let total = unassigned[key];
      maxValues[key] = -Math.pow(10, 12);
      data.results.forEach(row => {
        total -= row[key];
        maxValues[key] = Math.max(row[key], maxValues[key]);
      });
      unassigned[`${key}_pct`] = total / unassigned[key];
      unassigned[key] = total;
    });

    return {
      unassigned,
      maxValues,
    };
  }, [data?.results, totPop]);

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
                      const column = columnGetter(f.column);
                      const colorValue =
                        evalMode === 'count' ? row[column] / maxValues[column] : row[column];
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
