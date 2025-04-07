import {PersistOptions} from 'zustand/middleware';
import {NullableZone} from '../constants/types';
import {AxiosError, AxiosResponse} from 'axios';
import {StoreApi, UseBoundStore} from 'zustand';
import {TemporalState} from 'zundo';
import {MapStore} from './mapStore';

export type DistrictrMapOptions = {
  highlightBrokenDistricts?: boolean;
  higlightUnassigned?: boolean;
  lockPaintedAreas: Array<NullableZone>;
  mode: 'default' | 'break';
  showZoneNumbers?: boolean;
  paintByCounty?: boolean;
  currentStateFp?: string;
  showPopulationTooltip?: boolean;
  prominentCountyNames?: boolean;
  showCountyBoundaries?: boolean;
  showBlockPopulationNumbers?: boolean;
  showDemographicMap?: undefined | 'side-by-side' | 'overlay';
  showPaintedDistricts?: boolean;
};

export type DistrictrChartOptions = {
  popTargetPopDeviation?: number;
  popTargetPopDeviationPct?: number;
  popShowPopNumbers: boolean;
  popShowDistrictNumbers: boolean;
  popBarScaleToCurrent: boolean;
  popShowTopBottomDeviation: boolean;
};

interface APIErrorResponse extends AxiosResponse {
  detail: string;
}

export interface APIError extends AxiosError {
  response: APIErrorResponse;
}

export type StateWithMiddleware<T extends any> = UseBoundStore<
  Write<
    Write<
      WithDevtools<Write<StoreApi<T>, StorePersist<T, Partial<T>>>>,
      {
        temporal: StoreApi<TemporalState<T>>;
      }
    >,
    StoreSubscribeWithSelector<T>
  >
>;

export type MapStateWithMiddleware = StateWithMiddleware<MapStore>;

// from zustand internals
// devtools middleware
// https://github.com/pmndrs/zustand/blob/a7f51283a2159c7cb8d692eac59360f84d3bf8e7/src/middleware/devtools.ts#L50
// MIT License

// Copyright (c) 2019 Paul Henschel

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
export type Write<T, U> = Omit<T, keyof U> & U;
export type WithDevtools<S> = Write<S, StoreDevtools<S>>;
export type Cast<T, U> = T extends U ? T : U;
export type Action =
  | string
  | {
      type: string;
      [x: string | number | symbol]: unknown;
    };
export type StoreDevtools<S> = S extends {
  setState: {
    // capture both overloads of setState
    (...a: infer Sa1): infer Sr1;
    (...a: infer Sa2): infer Sr2;
  };
}
  ? {
      setState(...a: [...a: TakeTwo<Sa1>, action?: Action]): Sr1;
      setState(...a: [...a: TakeTwo<Sa2>, action?: Action]): Sr2;
    }
  : never;

export type TakeTwo<T> = T extends {length: 0}
  ? [undefined, undefined]
  : T extends {length: 1}
    ? [...a0: Cast<T, unknown[]>, a1: undefined]
    : T extends {length: 0 | 1}
      ? [...a0: Cast<T, unknown[]>, a1: undefined]
      : T extends {length: 2}
        ? T
        : T extends {length: 1 | 2}
          ? T
          : T extends {length: 0 | 1 | 2}
            ? T
            : T extends [infer A0, infer A1, ...unknown[]]
              ? [A0, A1]
              : T extends [infer A0, (infer A1)?, ...unknown[]]
                ? [A0, A1?]
                : T extends [(infer A0)?, (infer A1)?, ...unknown[]]
                  ? [A0?, A1?]
                  : never;
// persist middleware
type PersistListener<S> = (state: S) => void;
export type StorePersist<S, Ps> = {
  persist: {
    setOptions: (options: Partial<PersistOptions<S, Ps>>) => void;
    clearStorage: () => void;
    rehydrate: () => Promise<void> | void;
    hasHydrated: () => boolean;
    onHydrate: (fn: PersistListener<S>) => () => void;
    onFinishHydration: (fn: PersistListener<S>) => () => void;
    getOptions: () => Partial<PersistOptions<S, Ps>>;
  };
};
// subscribe with selector middleware
type StoreSubscribeWithSelector<T> = {
  subscribe: {
    (listener: (selectedState: T, previousSelectedState: T) => void): () => void;
    <U>(
      selector: (state: T) => U,
      listener: (selectedState: U, previousSelectedState: U) => void,
      options?: {
        equalityFn?: (a: U, b: U) => boolean;
        fireImmediately?: boolean;
      }
    ): () => void;
  };
};
