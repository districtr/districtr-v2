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
}

export const DEFAULT_CHART_OPTIONS: DistrictrChartOptions = {
  popShowPopNumbers: true,
  popShowTopBottomDeviation: true,
  popShowDistrictNumbers: true,
  popBarScaleToCurrent: false,
  popTargetPopDeviation: undefined,
  popTargetPopDeviationPct: undefined,
};

export const useChartStore = create(
  devwrapper(
    subscribeWithSelector<ChartStore>((set, get) => ({
      chartOptions: {...DEFAULT_CHART_OPTIONS},
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
    })),
    {
      ...devToolsConfig,
      name: 'Districtr Chart Store',
    }
  )
);
