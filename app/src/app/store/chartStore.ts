import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper} from './middlewareConfig';
import {UseQueryResult} from '@tanstack/react-query';
import {ZonePopulation} from '../utils/api/apiHandlers';
import {APIError, DistrictrChartOptions} from './types';
import {useMapStore} from './mapStore';
import {calculateMinMaxRange} from '../utils/zone-helpers';

export interface ChartStore {
  mapMetrics: UseQueryResult<ZonePopulation[], APIError | Error> | null;
  setMapMetrics: (metrics: UseQueryResult<ZonePopulation[], APIError | Error> | null) => void;
  updateMetrics: (popChanges: Record<number, number>) => void;
  chartOptions: DistrictrChartOptions;
  setChartOptions: (options: Partial<ChartStore['chartOptions']>) => void;
  chartInfo: {
    stats?: {min: number; max: number; range: number};
    chartData: Array<{zone: number; total_pop: number}>;
    unassigned: number | null;
    totPop: number;
  };
  setChartInfo: (info: ChartStore['chartInfo']) => void;
}

export const useChartStore = create(
  devwrapper(
    subscribeWithSelector<ChartStore>((set, get) => ({
      mapMetrics: null,
      setMapMetrics: metrics => set({mapMetrics: metrics}),
      chartOptions: {
        popShowPopNumbers: true,
        popShowTopBottomDeviation: false,
        popShowDistrictNumbers: true,
        popBarScaleToCurrent: false,
      },
      setChartOptions: options => set({chartOptions: {...get().chartOptions, ...options}}),
      updateMetrics: popChanges => {
        const mapMetrics = get().mapMetrics;
        let popData = mapMetrics?.data || [];
        Object.entries(popChanges).forEach(([zone, pop]) => {
          const popIndex = popData.findIndex(f => f.zone === +zone);
          if (popIndex === -1) {
            popData.push({
              zone: +zone,
              total_pop: pop,
            });
          } else {
            popData[popIndex] = {
              ...popData[popIndex],
              total_pop: popData[popIndex].total_pop + pop,
            };
          }
        });
        set({
          mapMetrics: {
            ...mapMetrics,
            data: popData as any,
          } as ChartStore['mapMetrics'],
        });
      },
      chartInfo: {
        stats: undefined,
        chartData: [],
        unassigned: 0,
        totPop: 0,
      },
      setChartInfo: chartInfo => set({chartInfo}),
    })),
    {
      ...devToolsConfig,
      name: 'Districtr Chart Store',
    }
  )
);

useChartStore.subscribe(
  store => store.mapMetrics,
  metrics => {
    const mapMetrics = metrics as ChartStore['mapMetrics'];
    const numDistricts = useMapStore?.getState().mapDocument?.num_districts;
    const totPop = useMapStore?.getState().summaryStats.totpop?.data?.total
    let unassigned = structuredClone(totPop)!;
    if (mapMetrics && mapMetrics.data && numDistricts && totPop && unassigned) {
      const chartData = Array.from({length: numDistricts}, (_, i) => i + 1).reduce(
        (acc, district) => {
          const totalPop = mapMetrics.data.reduce((acc, entry) => {
            return entry.zone === district ? acc + entry.total_pop : acc;
          }, 0);
          unassigned -= totalPop;
          return [...acc, {zone: district, total_pop: totalPop}];
        },
        [] as Array<{zone: number; total_pop: number}>
      );
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
  }
);
