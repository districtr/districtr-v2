import React, {useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useQuery} from '@tanstack/react-query';
import {
  getP1SummaryStats,
  P1SummaryStats,
  P1ZoneSummaryStats,
  P1ZoneSummaryStatsNumeric,
} from '@/app/utils/api/apiHandlers';
import { Button } from "@radix-ui/themes";
import {Heading, Flex, Spinner, Text} from '@radix-ui/themes';
import {queryClient} from '@utils/api/queryClient';

type EvalModes = 'share' | 'count' | 'pct';
type ColumnConfiguration<T extends Record<string, any>> = Array<{label: string; column: keyof T}>;
type EvaluationProps = {
  columnConfig: ColumnConfiguration<P1SummaryStats>;
};

const getEntryTotal = (entry: P1ZoneSummaryStats) =>
  Object.entries(entry).reduce((total, [key, value]) => {
    if (key !== 'zone') {
      return total + value; // Sum values of properties except 'zone'
    }
    return total; // Return total unchanged for 'zone'
  }, 0);

const calculateColumn = (
  mode: EvalModes,
  entry: P1ZoneSummaryStatsNumeric,
  totals: P1ZoneSummaryStats,
  column: keyof Omit<P1ZoneSummaryStats, 'zone'>
) => {
  const count = entry[column];
  switch (mode) {
    case 'count':
      return count;
    case 'pct':
      return count / entry['total'];
    case 'share':
      return count / totals[column];
  }
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
    label: 'Other',
    column: 'other_pop',
  },
];

const modeButtonConfig: Array<{label: string, value: EvalModes}> = [
  {
    label: "Population by Share",
    value: 'share'
  },
  {
    label: "Population by Count",
    value: 'count'
  },
  {
    label: "Population by Percent of Zone",
    value: 'pct'
  }
]

const Evaluation: React.FC<EvaluationProps> = ({columnConfig = defaultColumnConfig}) => {
  const [evalMode, setEvalMode] = useState<EvalModes>('share');

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
  let totals: P1ZoneSummaryStats | undefined = undefined;
  let zones: P1ZoneSummaryStatsNumeric[] = [];

  data?.results.forEach(entry => {
    if (entry.zone === 'Total') {
      totals = entry;
    } else {
      zones.push({
        ...entry,
        zone: parseInt(entry.zone),
        total: getEntryTotal(entry),
      });
    }
  });

  if (!totals || (mapDocument && !mapDocument.available_summary_stats)) {
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

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="w-full">
      <Flex align="center" gap="3">
        {modeButtonConfig.map((mode, i) => <Button key={i}
          variant={mode.value === evalMode ? 'solid' : 'outline'}
          onClick={() => setEvalMode(mode.value)}
        >{mode.label}</Button>)}
        {isLoading && <Spinner />}
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
            {zones
              .sort((a, b) => a.zone - b.zone)
              .map(row => (
                <tr key={row.zone} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium">{row.zone}</td>
                  {columnConfig.map((f, i) => (
                    <td className="py-2 px-4 text-right">
                      {/* todo: clean types */}
                      {formatNumber(calculateColumn(evalMode, row, totals!, f.column))}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Evaluation;
