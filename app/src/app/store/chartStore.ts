import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper} from './middlewareConfig';
import {UseQueryResult} from '@tanstack/react-query';
import {ZonePopulation} from '../utils/api/apiHandlers';
import {DistrictrChartOptions} from './types';

export interface ChartStore {
  mapMetrics: UseQueryResult<ZonePopulation[], Error> | null;
  setMapMetrics: (metrics: UseQueryResult<ZonePopulation[], Error> | null) => void;
  updateMetrics: (popChanges: Record<number, number>) => void;
  chartOptions: DistrictrChartOptions;
  setChartOptions: (options: Partial<ChartStore['chartOptions']>) => void;
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
    })),
    {
      ...devToolsConfig,
      name: 'Districtr Chart Store',
    }
  )
);
