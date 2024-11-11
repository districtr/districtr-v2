import React from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useQuery} from '@tanstack/react-query';
import {getP1SummaryStats} from '@/app/utils/api/apiHandlers';
import {Heading, Flex, Spinner, Text} from '@radix-ui/themes';
import {queryClient} from '@utils/api/queryClient';

export default function Evaluation() {
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

  if (mapDocument && !mapDocument.available_summary_stats) {
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
        <Heading as="h2" size="2" mb="2">
          {data?.summary_stat}
        </Heading>
        {isLoading && <Spinner />}
      </Flex>
      <div className="overflow-x-auto text-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="py-2 px-4 text-left font-semibold">Zone</th>
              <th className="py-2 px-4 text-right font-semibold">White</th>
              <th className="py-2 px-4 text-right font-semibold">Black</th>
              <th className="py-2 px-4 text-right font-semibold">Asian</th>
              <th className="py-2 px-4 text-right font-semibold">Am. Indian</th>
              <th className="py-2 px-4 text-right font-semibold">Pacific Isl.</th>
              <th className="py-2 px-4 text-right font-semibold">Other</th>
            </tr>
          </thead>
          <tbody>
            {data?.results
              .sort((a, b) => a.zone - b.zone)
              .map(row => (
                <tr key={row.zone} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium">{row.zone}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(row.white_pop)}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(row.black_pop)}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(row.asian_pop)}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(row.amin_pop)}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(row.nhpi_pop)}</td>
                  <td className="py-2 px-4 text-right">{formatNumber(row.other_pop)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
