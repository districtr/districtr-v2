import React from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useQuery} from '@tanstack/react-query';
import {getP1SummaryStats} from '@/app/utils/api/apiHandlers';
import {Heading} from '@radix-ui/themes';
import {queryClient} from '@utils/api/queryClient';

export default function Evaluation() {
  const mapDocument = useMapStore.getState().mapDocument;

  // Doesn't update properly reacively
  const {data, error} = useQuery(
    {
      queryKey: ['p1SummaryStats', mapDocument],
      queryFn: () => mapDocument && getP1SummaryStats(mapDocument),
      enabled: !!mapDocument,
    },
    queryClient
  );

  if (mapDocument && !mapDocument.available_summary_stats) {
    return (
      <div>
        <h1>Summary Statistics</h1>
        <p>Summary statistics are not available for this map.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1>Summary Statistics</h1>
        <p>There was an error loading the summary statistics.</p>
      </div>
    );
  }

  if (!data?.results) {
    return <div>Loading...</div>;
  }

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="w-full p-4">
      <Heading as="h2" size="2" mb="2">
        {data.summary_stat}
      </Heading>
      <div className="overflow-x-auto">
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
            {data.results.map(row => (
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
