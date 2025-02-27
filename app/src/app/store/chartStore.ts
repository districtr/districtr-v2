import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {devToolsConfig, devwrapper} from './middlewareConfig';
import {DistrictrChartOptions} from './types';

export interface ChartStore {
  chartOptions: DistrictrChartOptions;
  setChartOptions: (options: Partial<ChartStore['chartOptions']>) => void;
  paintedChanges: Record<string, number>;
  setPaintedChanges: (popChanges: Record<number, number>) => void;
  dataUpdateHash: string;
  setDataUpdateHash: (hash: string) => void;
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
      chartOptions: {
        popShowPopNumbers: true,
        popShowTopBottomDeviation: false,
        popShowDistrictNumbers: true,
        popBarScaleToCurrent: false,
      },
      setChartOptions: options => set({chartOptions: {...get().chartOptions, ...options}}),
      dataUpdateHash: '',
      paintedChanges: {},
      setDataUpdateHash: dataUpdateHash => set({dataUpdateHash, paintedChanges: {}}),
      setPaintedChanges: paintedChanges => {
        let changes = structuredClone(get().paintedChanges);
        Object.entries(paintedChanges).forEach(([zone, pop]) => {
          changes[zone] = (changes[zone] || 0) + pop;
        });
        set({paintedChanges: changes});
      },
      chartInfo: {
        stats: undefined,
        chartData: [],
        unassigned: null,
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