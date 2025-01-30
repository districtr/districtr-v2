import {ChartStore, useChartStore} from '@/app/store/chartStore';
import {useMapStore} from '@/app/store/mapStore';
import {calculateMinMaxRange} from '../zone-helpers';
import { NullableZone } from '@/app/constants/types';
import { debounce } from 'lodash';

export const paintedPopulation: Map<
    string,
    {
      from: NullableZone;
      to: NullableZone;
      population: number;
    }
  > = new Map();

export const updateChartData = (
  mapMetrics: ChartStore['mapMetrics']
) => {
  const numDistricts = useMapStore?.getState().mapDocument?.num_districts;
  const totPop = useMapStore?.getState().summaryStats.totpop?.data?.total;
  let unassigned = structuredClone(totPop)!;
  if (totPop && numDistricts && mapMetrics && mapMetrics.data && numDistricts && totPop) {
    const populations: Record<string, number> = {};

    new Array(numDistricts).fill(null).forEach((_, i) => {
      const zone = i + 1;
      populations[zone] = mapMetrics.data.find(f => f.zone === zone)?.total_pop ?? 0;
    });
    paintedPopulation.forEach(({from, to, population}) => {
      if (from === to) return
      if (from) {
        populations[from] -= population;
      }
      if (to) {
        populations[to] += population;
      }
    });

    const chartData = Object.entries(populations).map(([zone, total_pop]) => {
      unassigned -= total_pop;
      return {zone: +zone, total_pop};
    });

    const allAreNonZero = chartData.every(entry => entry.total_pop > 0);
    const stats = allAreNonZero ? calculateMinMaxRange(chartData) : undefined;
    
    useChartStore.getState().setChartInfo({
      stats,
      chartData,
      unassigned,
      totPop,
    });
  } else {
    useChartStore.getState().setChartInfo({
      stats: undefined,
      chartData: [],
      unassigned: null,
      totPop: 0,
    });
  }
};
// export const updateChartData = debounce(_updateChartData, 50);